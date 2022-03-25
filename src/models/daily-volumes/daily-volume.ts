/* eslint-disable @typescript-eslint/no-explicit-any */

// TODO: Get rid of all the `any` types

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { PgPromiseQuery, idb, pgp } from "@/common/db";

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
      const initialRow = await idb.oneOrNone(
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
      results = await idb.manyOrNone(
        `
          SELECT
              "collection_id",
              sum("fe"."price") AS "volume",              
              RANK() OVER (ORDER BY SUM(price) DESC, "collection_id") "rank"
          FROM "fill_events_2" "fe"
              JOIN "tokens" "t" ON "fe"."token_id" = "t"."token_id" AND "fe"."contract" = "t"."contract"
              JOIN "collections" "c" ON "t"."collection_id" = "c"."id"
          WHERE
              "fe"."timestamp" >= $/startTime/
              AND "fe"."timestamp" < $/endTime/
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
      results.push({
        collection_id: -1,
        volume: 0,
        rank: -1,
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
                 volume
                )
            VALUES (
                $/collection_id/, 
                ${startTime}, 
                $/rank/, 
                $/volume/
            )
            ON CONFLICT ON CONSTRAINT daily_volumes_pk
            DO 
                UPDATE SET volume = $/volume/, rank = $/rank/
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
      day1Results = await idb.manyOrNone(
        `
          SELECT 
                 collection_id,
                 rank AS $1:name,
                 volume AS $2:name
          FROM daily_volumes
          WHERE timestamp = $3 AND collection_id != '-1'
      `,
        ["day1_rank", "day1_volume", day1Timestamp]
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
               SUM(volume) AS $2:name
        FROM daily_volumes
        WHERE timestamp >= $3 AND collection_id != '-1'
        GROUP BY collection_id
      `;

    try {
      day7Results = await idb.manyOrNone(query, ["day7_rank", "day7_volume", day7Timestamp]);
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
      day30Results = await idb.manyOrNone(query, ["day30_rank", "day30_volume", day30Timestamp]);
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
      allTimeResults = await idb.manyOrNone(query, ["all_time_rank", "all_time_volume", 0]);
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
                all_time_rank = $/all_time_rank/
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
    const res = await redis.set(this.lockKey, jobs, ["NX", "EX"], "3600");
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
