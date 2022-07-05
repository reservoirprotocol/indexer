/* eslint-disable @typescript-eslint/no-explicit-any */

// TODO: Get rid of all the `any` types

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { PgPromiseQuery, idb, pgp, redb } from "@/common/db";

export class DailyVolume {
  private static lockKey = "daily-volumes-running";

  /**
   * Check if the daily volume for this day was already calculated and stored
   * We will keep a collection_id: -1 and timestamp in the database for each day we processed already
   *
   * @param startTime
   */
  public static async isDaySynced(startTime: number): Promise<boolean> {
    try {
      const initialRow = await redb.oneOrNone(
        `
            SELECT volume
            FROM "daily_volumes"
            WHERE "collection_id" = '-1'
              AND "timestamp" = $/startTime/
        `,
        {
          startTime,
        }
      );

      if (initialRow !== null) {
        logger.info(
          "daily-volumes",
          `Daily volumes for ${startTime} already calculated, nothing to do`
        );
        return true;
      }
    } catch (e) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Couldn't determine if the daily volume for timestamp ${startTime} was already added to the database`,
          timestamp: startTime,
          exception: e,
        })
      );

      throw e;
    }

    return false;
  }

  /**
   * Calculate for the given day the sales volume and store these values in the database:
   * - daily_volumes: so we can get historical data for each day
   * - collections: update each collection with the rank and sales volume, for fast retrieval in APIs
   *
   * Once these updates are done, add a collection_id: -1, timestamp to daily_volumes to indicate we calculated this
   * day already
   *
   * @param startTime
   * @param ignoreInsertedRows
   */
  public static async calculateDay(
    startTime: number,
    ignoreInsertedRows = false
  ): Promise<boolean> {
    logger.info("daily-volumes", `Calculating daily volumes for ${startTime}`);
    // Don't recalculate if the day was already calculated
    if (!ignoreInsertedRows) {
      try {
        if (await this.isDaySynced(startTime)) {
          return true;
        }
      } catch (e) {
        return false;
      }
    }

    // Get the startTime and endTime of the day we want to calculate
    const endTime = startTime + 24 * 3600;

    let results = [];
    try {
      results = await redb.manyOrNone(
        `
          SELECT
              "collection_id",
              sum("fe"."price") AS "volume",              
              RANK() OVER (ORDER BY SUM(price) DESC, "collection_id") "rank",
              min(fe.price) AS "floor_sell_value",
              count(fe.price) AS "sales_count"
          FROM "fill_events_2" "fe"
              JOIN "tokens" "t" ON "fe"."token_id" = "t"."token_id" AND "fe"."contract" = "t"."contract"
              JOIN "collections" "c" ON "t"."collection_id" = "c"."id"
          WHERE
              "fe"."timestamp" >= $/startTime/
              AND "fe"."timestamp" < $/endTime/
              AND fe.price > 0
          GROUP BY "collection_id"
        `,
        {
          startTime,
          endTime,
        }
      );
    } catch (e) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error while trying to fetch the calculations for the daily volume`,
          timestamp: startTime,
          exception: e,
        })
      );

      return false;
    }

    // If we have results, we can now insert them into the daily_volumes table and update collections
    if (results.length) {
      // Add a row for this day, that will mark that this day has already been calculated
      results.push({
        collection_id: -1,
        volume: 0,
        rank: -1,
        floor_sell_value: 0,
        sales_count: 0,
      });

      const queries: PgPromiseQuery[] = [];
      results.forEach((values: any) => {
        queries.push({
          query: `
            INSERT INTO 
                daily_volumes
                (
                 collection_id, 
                 timestamp, 
                 rank, 
                 volume,
                 floor_sell_value,
                 sales_count
                )
            VALUES (
                $/collection_id/, 
                ${startTime}, 
                $/rank/, 
                $/volume/,
                $/floor_sell_value/,
                $/sales_count/
            )
            ON CONFLICT ON CONSTRAINT daily_volumes_pk
            DO 
                UPDATE SET 
                    volume = $/volume/, 
                    rank = $/rank/, 
                    floor_sell_value = $/floor_sell_value/, 
                    sales_count = $/sales_count/
            `,
          values: values,
        });
      });

      try {
        const concat = pgp.helpers.concat(queries);
        await idb.none(concat);
      } catch (e: any) {
        logger.error(
          "daily-volumes",
          JSON.stringify({
            msg: `Error while inserting/updating daily volumes`,
            timestamp: startTime,
            exception: e.message,
          })
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Update the collections table (fields day1_volume, day1_rank, etc) with latest values we have from daily_volumes
   *
   * @return boolean Returns false when it fails to update the collection, will need to reschedule the job
   */
  public static async updateCollections(): Promise<boolean> {
    // Skip the query when the collection_id = -1
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    const day1Timestamp = date.getTime() / 1000 - 24 * 3600;
    const day7Timestamp = date.getTime() / 1000 - 7 * 24 * 3600;
    const day30Timestamp = date.getTime() / 1000 - 30 * 24 * 3600;

    let day1Results: any = [];
    let day7Results: any = [];
    let day30Results: any = [];
    let allTimeResults: any = [];

    // Get the previous day data
    try {
      day1Results = await redb.manyOrNone(
        `
          SELECT 
                 collection_id,
                 rank AS $1:name,
                 volume AS $2:name,
                 floor_sell_value as $3:name
          FROM daily_volumes
          WHERE timestamp = $4 AND collection_id != '-1'
      `,
        ["day1_rank", "day1_volume", "day1_floor_sell_value", day1Timestamp]
      );
    } catch (e: any) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error while calculating previous day volumes`,
          exception: e.message,
        })
      );
    }

    if (!day1Results.length) {
      logger.error(
        "daily-volumes",
        "No daily volumes found for the previous day, should be impossible"
      );

      return false;
    }

    // Get 7, 30, all_time days previous data
    const query = `
        SELECT 
               collection_id,
               RANK() OVER (ORDER BY SUM(volume) DESC, "collection_id") $1:name,
               SUM(volume) AS $2:name,
               MIN(floor_sell_value) AS $3:name
        FROM daily_volumes
        WHERE timestamp >= $4 AND collection_id != '-1'
        GROUP BY collection_id
      `;

    try {
      day7Results = await redb.manyOrNone(query, [
        "day7_rank",
        "day7_volume",
        "day7_floor_sell_value",
        day7Timestamp,
      ]);
    } catch (e: any) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error while calculating 7 day daily volumes`,
          exception: e.message,
        })
      );

      return false;
    }

    try {
      day30Results = await redb.manyOrNone(query, [
        "day30_rank",
        "day30_volume",
        "day30_floor_sell_value",
        day30Timestamp,
      ]);
    } catch (e: any) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error while calculating 30 day daily volumes`,
          exception: e.message,
        })
      );

      return false;
    }

    try {
      allTimeResults = await redb.manyOrNone(query, [
        "all_time_rank",
        "all_time_volume",
        "all_time_floor_sell_value",
        0,
      ]);
    } catch (e: any) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error while calculating all time daily volumes`,
          exception: e.message,
        })
      );

      return false;
    }

    const mergedArr = this.mergeArrays(day1Results, day7Results, day30Results, allTimeResults);

    if (!mergedArr.length) {
      logger.error(
        "daily-volumes",
        "No daily volumes found for 1, 7 and 30 days. Should be impossible"
      );

      return false;
    }

    try {
      const queries: any = [];
      mergedArr.forEach((row: any) => {
        queries.push({
          query: `
            UPDATE collections
            SET
                day1_volume = $/day1_volume/,
                day1_rank   = $/day1_rank/,
                day7_volume = $/day7_volume/,
                day7_rank   = $/day7_rank/,
                day30_volume = $/day30_volume/,
                day30_rank   = $/day30_rank/,
                all_time_volume = $/all_time_volume/,
                all_time_rank = $/all_time_rank/,
                updated_at = now()
            WHERE
                id = $/collection_id/`,
          values: row,
        });
      });

      await idb.none(pgp.helpers.concat(queries));
    } catch (e: any) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error while calculating the daily volumes for insertion into the collections table`,
          exception: e.message,
        })
      );
      return false;
    }

    try {
      if (!(await DailyVolume.calculateVolumeChange(1))) {
        return false;
      }
      if (!(await DailyVolume.calculateVolumeChange(7))) {
        return false;
      }
      if (!(await DailyVolume.calculateVolumeChange(30))) {
        return false;
      }

      if (!(await DailyVolume.cacheFloorSalePrice(1))) {
        return false;
      }
      if (!(await DailyVolume.cacheFloorSalePrice(7))) {
        return false;
      }
      if (!(await DailyVolume.cacheFloorSalePrice(30))) {
        return false;
      }
    } catch (e: any) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error while calculating volume changes`,
          exception: e.message,
        })
      );
      return false;
    }

    return true;
  }

  /**
   * Once a day calculate the volume changes in percentages from the previous period
   * We will calculate day 1, day 7 and day 30 percentage changes
   * The calculation is a sliding window, so for example for 7 day we take the last 7 days and divide them by the
   * 7 days before that
   *
   * @param days The amount of days you want to calculate volume changes for, this should be 1, 7 or 30
   */
  public static async calculateVolumeChange(days: number): Promise<boolean> {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    const timeDiff = days * 24 * 3600;

    const currentPeriod = date.getTime() / 1000 - timeDiff; // The last 1, 7, 30 days
    const previousPeriod = currentPeriod - timeDiff; // The period before the last 1, 7, 30 days

    logger.info(
      "daily-volumes",
      JSON.stringify({
        msg: `running calculateVolumeChange for period ${days}`,
      })
    );

    const query = `
        SELECT 
               collection_id,               
               SUM(volume) AS $1:name              
        FROM daily_volumes
        WHERE timestamp >= $2 
            AND timestamp < $3 
            AND collection_id != '-1'
        GROUP BY collection_id
      `;

    let results: any = [];
    try {
      results = await redb.manyOrNone(query, [
        `prev_day${days}_volume`,
        previousPeriod,
        currentPeriod,
      ]);
    } catch (e: any) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error while calculating the previous period volume`,
          exception: e.message,
        })
      );

      return false;
    }

    if (!results.length) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `No previous period data found for day${days} with timestamps between ${previousPeriod} and ${currentPeriod}`,
        })
      );

      return true;
    }

    const queries: any = [];
    results.forEach((row: any) => {
      queries.push({
        query: `
            UPDATE collections
            SET day${days}_volume_change = day${days}_volume / NULLIF($/prev_day${days}_volume/::numeric, 0),
                updated_at = now()                
            WHERE id = $/collection_id/`,
        values: row,
      });
    });

    try {
      await idb.none(pgp.helpers.concat(queries));
    } catch (e: any) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error while updating the previous period volume in the collections table`,
          exception: e.message,
        })
      );
      return false;
    }

    logger.info(
      "daily-volumes",
      JSON.stringify({
        msg: `Finished calculateVolumeChange for period ${days}`,
      })
    );

    return true;
  }

  /**
   * Cache the floor sale price of all collections of a specific previous period into the collections table
   * For example if you pass period: 7 it will take the floor_sale_price 7 days ago and fetch that
   * floor_sale_price from daily_volumes, and then update that collection's day7_floor_sale_price
   *
   * @param period The previous period you want to fetch and update into collections, can be 1/7/30
   */
  public static async cacheFloorSalePrice(period: number): Promise<boolean> {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    const timeDiff = period * 24 * 3600;
    const dayToFetch = date.getTime() / 1000 - timeDiff;

    logger.info(
      "daily-volumes",
      JSON.stringify({
        msg: `Running cacheFloorSalePrice for period ${period}`,
      })
    );

    const query = `
        SELECT 
               collection_id,               
               floor_sell_value
        FROM daily_volumes
        WHERE timestamp = $1              
            AND collection_id != '-1'        
      `;

    let results: any = [];
    try {
      results = await redb.manyOrNone(query, [dayToFetch]);
    } catch (e: any) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error fetching the floor_sell_value of day ${dayToFetch}`,
          exception: e.message,
        })
      );

      return false;
    }

    if (!results.length) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `No floor_sell_value found for day ${dayToFetch}`,
        })
      );

      return true;
    }

    const queries: any = [];
    results.forEach((row: any) => {
      queries.push({
        query: `
            UPDATE collections
            SET day${period}_floor_sell_value = $/floor_sell_value/,
                updated_at = now()                              
            WHERE id = $/collection_id/`,
        values: row,
      });
    });

    try {
      await idb.none(pgp.helpers.concat(queries));
    } catch (e: any) {
      logger.error(
        "daily-volumes",
        JSON.stringify({
          msg: `Error while updating the floor_sell_value of period ${period} in the collections table`,
          exception: e.message,
        })
      );
      return false;
    }

    logger.info(
      "daily-volumes",
      JSON.stringify({
        msg: `Finished cacheFloorSalePrice for period ${period}`,
      })
    );

    return true;
  }

  /**
   * Merge the individual arrays of day summaries together, make sure all fields exist for each collection_id
   *
   * @param day1
   * @param day7
   * @param day30
   */
  public static mergeArrays(day1: any, day7: any, day30: any, allTime: any) {
    const map = new Map();
    day1.forEach((item: any) => map.set(item.collection_id, item));
    day7.forEach((item: any) =>
      map.set(item.collection_id, { ...map.get(item.collection_id), ...item })
    );
    day30.forEach((item: any) =>
      map.set(item.collection_id, { ...map.get(item.collection_id), ...item })
    );
    allTime.forEach((item: any) =>
      map.set(item.collection_id, { ...map.get(item.collection_id), ...item })
    );
    const mergedArr = Array.from(map.values());

    for (let x = 0; x < mergedArr.length; x++) {
      const row = mergedArr[x];

      if (!row["day1_volume"]) {
        row["day1_volume"] = 0;
        row["day1_rank"] = null;
      }

      if (!row["day7_volume"]) {
        row["day7_volume"] = 0;
        row["day7_rank"] = null;
      }

      if (!row["day30_volume"]) {
        row["day30_volume"] = 0;
        row["day30_rank"] = null;
      }

      if (!row["all_time_volume"]) {
        row["all_time_volume"] = 0;
        row["all_time_rank"] = null;
      }
    }

    return mergedArr;
  }

  /**
   * Put a lock into place so no 2 processes can start calculations at the same time
   *
   * @param jobs
   */
  public static async initiateLock(jobs: number): Promise<boolean> {
    const res = await redis.set(this.lockKey, jobs, ["NX", "EX"], "14400");
    return res ? true : false;
  }

  /**
   * Check if calculations are running
   */
  public static async isJobRunning(): Promise<boolean> {
    return (await redis.get(this.lockKey)) ? true : false;
  }

  /**
   * Each time a job is finished, do a tick, and decrease the number on the lock
   * Once we reach 0, we know we don't have any more jobs to run, and we can finish by updating our calculations table
   * with the latest values.
   * For the cronjob that syncs daily volumes, this lock will not exist, and it will decrease the value to -1
   * which is fine, and just cleans up the lock anyway
   *
   * @return boolean When all jobs are done return true, otherwise we return false
   */
  public static async tickLock(): Promise<boolean> {
    const res = await redis.decr(this.lockKey);
    if (res <= 0) {
      await redis.expire(this.lockKey, 0);
      return true;
    } else {
      return false;
    }
  }
}
