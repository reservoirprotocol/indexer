/* eslint-disable @typescript-eslint/no-explicit-any */

// TODO: Get rid of all the `any` types

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { PgPromiseQuery, idb, pgp, redb, ridb } from "@/common/db";
import _ from "lodash";

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
    } catch (error) {
      logger.error(
        "daily-volumes",
        `Couldn't determine if the daily volume for timestamp ${startTime} was already added to the database`
      );

      throw error;
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
   * @param collectionId
   */
  public static async calculateDay(
    startTime: number,
    ignoreInsertedRows = false,
    collectionId = ""
  ): Promise<boolean> {
    logger.info("daily-volumes", `Calculating daily volumes. startTime=${startTime}`);
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
      results = await ridb.manyOrNone(
        `
          SELECT t1.collection_id,
            t1.volume,
            COALESCE(t2.volume, 0) AS volume_clean,
            t1.rank,
            COALESCE(t2.rank, -1) AS rank_clean,
            t1.floor_sell_value,
		    COALESCE(t2.floor_sell_value, 0) AS floor_sell_value_clean,
			t1.sales_count,
		    COALESCE(t2.sales_count, 0) AS sales_count_clean
          FROM 
            (SELECT
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
              AND fe.is_deleted = 0
              AND fe.is_primary IS NOT TRUE 
              ${collectionId ? "AND collection_id = $/collectionId/" : ""}
            GROUP BY "collection_id") t1
          LEFT JOIN
            (SELECT
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
              AND fe.is_deleted = 0
              AND fe.is_primary IS NOT TRUE 
              AND coalesce(fe.wash_trading_score, 0) = 0
              ${collectionId ? "AND collection_id = $/collectionId/" : ""}
            GROUP BY "collection_id") t2
          ON (t1.collection_id = t2.collection_id)
        `,
        {
          startTime,
          endTime,
          collectionId,
        }
      );
    } catch (error) {
      logger.error(
        "daily-volumes",
        `Error while trying to fetch the calculations for the daily volume. startTime=${startTime}, endTime=${endTime}, error=${error}`
      );

      return false;
    }

    // If we have results, we can now insert them into the daily_volumes table and update collections
    if (results.length) {
      // Add a row for this day, that will mark that this day has already been calculated
      results.push({
        collection_id: -1,
        volume: 0,
        volume_clean: 0,
        rank: -1,
        rank_clean: -1,
        floor_sell_value: 0,
        floor_sell_value_clean: 0,
        sales_count: 0,
        sales_count_clean: 0,
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
                 rank_clean,
                 volume,
                 volume_clean,
                 floor_sell_value,
                 floor_sell_value_clean,
                 sales_count,
                 sales_count_clean
                )
            VALUES (
                $/collection_id/, 
                ${startTime}, 
                $/rank/, 
                $/rank_clean/, 
                $/volume/,
                $/volume_clean/,
                $/floor_sell_value/,
                $/floor_sell_value_clean/,
                $/sales_count/,
                $/sales_count_clean/
            )
            ON CONFLICT ON CONSTRAINT daily_volumes_pk
            DO UPDATE SET 
              volume = $/volume/, 
              volume_clean = $/volume_clean/, 
              rank = $/rank/, 
              rank_clean = $/rank_clean/, 
              floor_sell_value = $/floor_sell_value/, 
              floor_sell_value_clean = $/floor_sell_value_clean/, 
              sales_count = $/sales_count/,
              sales_count_clean = $/sales_count_clean/,
              updated_at = now()
            `,
          values: values,
        });
      });

      try {
        const concat = pgp.helpers.concat(queries);
        await idb.none(concat);
      } catch (error: any) {
        logger.error(
          "daily-volumes",
          `Error while inserting/updating daily volumes. startTime=${startTime}, endTime=${endTime}c`
        );

        return false;
      }
    }

    return true;
  }

  /**
   * update the 1day volume for all collections as a 24h rolling average
   *
   **/
  public static async update1Day(collectionId = "") {
    const currentDate = new Date();
    const startTime = Math.floor(
      new Date(currentDate.getTime() - 24 * 60 * 60 * 1000).getTime() / 1000
    );

    // Get a list of all collections that have non-null 1day values
    const collectionsWith1DayValues = await ridb.manyOrNone(
      `SELECT id FROM collections WHERE day1_volume != 0
       ${collectionId ? "AND id = $/collectionId/" : ""}`,
      { collectionId }
    );

    const results = await ridb.manyOrNone(
      `SELECT t1.collection_id,
       t1.volume,
       t1.sales_count,
       t1.rank,
       t1.floor_sell_value,
       t1.volume_change,
       t1.contract
      FROM
        (SELECT
          t.contract,
          t."collection_id",
          sum("fe"."price") AS "volume",
          COUNT(*) AS "sales_count",
          RANK() OVER (ORDER BY SUM(price) DESC, t."collection_id") "rank",
          min(fe.price) AS "floor_sell_value",
          (sum("fe"."price") / vc.volume_past) as "volume_change"
        FROM "fill_events_2" "fe"
          JOIN "tokens" "t" ON "fe"."token_id" = "t"."token_id" AND "fe"."contract" = "t"."contract"
          JOIN "collections" "c" ON "t"."collection_id" = "c"."id"
          LEFT JOIN (
            SELECT
              t.contract,
              t.collection_id,
              sum("fe2"."price") as "volume_past"
            FROM fill_events_2 fe2
            JOIN tokens t ON fe2.token_id = t.token_id AND fe2.contract = t.contract
            WHERE fe2.price > 0
            AND "fe2".is_deleted = 0
            AND "fe2"."timestamp" < $/yesterdayTimestamp/
            AND "fe2".timestamp >= $/endYesterdayTimestamp/
            ${collectionId ? "AND t.collection_id = $/collectionId/" : ""}
            GROUP BY t.contract, t.collection_id
          ) vc ON t.contract = vc.contract AND t.collection_id = vc.collection_id
        WHERE
          "fe"."timestamp" >= $/yesterdayTimestamp/
          AND fe.price > 0
          AND fe.is_deleted = 0
          AND fe.is_primary IS NOT TRUE
          AND coalesce(fe.wash_trading_score, 0) = 0
          ${collectionId ? "AND t.collection_id = $/collectionId/" : ""}
        GROUP BY t.contract, t."collection_id", vc.volume_past) t1
        `,
      {
        yesterdayTimestamp: startTime,
        endYesterdayTimestamp: startTime - 24 * 60 * 60,
        collectionId,
      }
    );

    // If we have results, we can now insert them into the daily_volumes table and update collections
    if (results.length) {
      const queries: PgPromiseQuery[] = [];
      results.forEach((values: any) => {
        queries.push({
          query: `
            UPDATE collections
            SET
              day1_volume = $/volume/,
              day1_rank = $/rank/,
              day1_floor_sell_value = $/floor_sell_value/,
              day1_volume_change = $/volume_change/,
              day1_sales_count = $/sales_count/,
              updated_at = now()
            WHERE id = $/collection_id/
            `,
          values: values,
        });
      });

      try {
        const concat = pgp.helpers.concat(queries);
        await idb.none(concat);
      } catch (error: any) {
        logger.error(
          "day-1-volumes",
          `Error while inserting/updating daily volumes. collectionId=${collectionId}`
        );

        return false;
      }
    }

    const updatedCollectionIds = results.map((r: any) => r.collection_id);
    const collectionsToUpdateToNull = collectionsWith1DayValues.filter(
      (c: any) => !updatedCollectionIds.includes(c.id)
    );

    if (collectionsToUpdateToNull.length) {
      const updateToNullQueries = collectionsToUpdateToNull.map((c: any) => {
        return {
          query: `
          UPDATE collections
          SET
            day1_volume = 0,
            day1_rank = NULL,
            day1_floor_sell_value = NULL,
            day1_volume_change = NULL,
            day1_sales_count = 0,
            updated_at = now()
          WHERE id = $/collection_id/
        `,
          values: { collection_id: c.id },
        };
      });

      try {
        const concat = pgp.helpers.concat(updateToNullQueries);
        await idb.none(concat);
      } catch (error: any) {
        logger.error(
          "day-1-volumes",
          `Error while setting 1day values to null. collectionId=${collectionId}`
        );

        return false;
      }
    }

    return true;
  }

  /**
   * update the all time volume for all collections by calculating the volume since the most recent daily_volume entry for each collection, and then adding it to the sum of all_time_volume from summing all daily_volume entries for each collection
   *
   **/
  public static async updateAllTimeVolume(collectionId = ""): Promise<boolean> {
    try {
      // Step 1: Get the most recent timestamp for each collection from daily_volumes
      const mostRecentTimestamps = await redb.manyOrNone(
        `
        SELECT collections.id, MAX(timestamp) as recent_timestamp
        FROM collections
        LEFT JOIN daily_volumes ON collections.id = daily_volumes.collection_id
        WHERE collections.id != '-1'
        AND collections.day1_volume > 0
        ${collectionId ? "AND collections.id = $/collectionId/" : ""}
        GROUP BY collections.id
      `,
        { collectionId }
      );

      // Step 2: Calculate the volume since the most recent timestamp for each collection

      // batch the the queries to get the volume since the most recent timestamp for each collection
      // to avoid hitting the max query size limit

      const mostRecentTimestampsChunks = _.chunk(mostRecentTimestamps, 100);
      let recentVolumes: {
        collection_id: string;
        volume_since_recent: number;
        total_new_volume: number;
      }[] = [];

      await Promise.all(
        mostRecentTimestampsChunks.map(async (chunk: any) => {
          for (const row of chunk) {
            try {
              const volumeSinceRecent = await redb.oneOrNone(
                `
            SELECT SUM("fe"."price") as volume_since_recent
            FROM "fill_events_2" "fe"
            JOIN "tokens" "t" ON "fe"."token_id" = "t"."token_id" AND "fe"."contract" = "t"."contract"
            WHERE "fe"."timestamp" > $/recentTimestamp/
              AND "t"."collection_id" = $/collectionId/
              AND fe.price > 0
              AND fe.is_deleted = 0
              AND fe.is_primary IS NOT TRUE 
              AND coalesce(fe.wash_trading_score, 0) = 0
          `,
                {
                  recentTimestamp: row?.recent_timestamp ? row.recent_timestamp + 24 * 60 * 60 : 0,
                  collectionId: row.id,
                }
              );

              let totalVolume = { total_volume: 0 };

              const redisTotalVolume = await redis.get(`all_time_volume_${row.id}`);
              if (redisTotalVolume) {
                totalVolume.total_volume = parseInt(redisTotalVolume, 10);
              } else if (row?.recent_timestamp) {
                // only try to get the total volume from postgres if we have a recent timestamp (that means we have daily_volume entries for this collection, but its not in redis for some reason)
                const pgTotalVolume = await redb.oneOrNone(
                  `
              SELECT SUM(volume_clean) as total_volume
              FROM daily_volumes
              WHERE collection_id != '-1'
                AND collection_id = $/collectionId/
              GROUP BY collection_id
            `,
                  {
                    collectionId: row.id,
                  }
                );

                if (pgTotalVolume) {
                  await redis.set(
                    `all_time_volume_${row.id}`,
                    totalVolume.total_volume,
                    "EX",
                    60 * 60 * 24
                  );
                  totalVolume = pgTotalVolume;
                } else {
                  totalVolume = { total_volume: 0 };
                }
              } else {
                totalVolume = { total_volume: 0 };
              }

              recentVolumes.push({
                collection_id: row.id,
                volume_since_recent: volumeSinceRecent ? volumeSinceRecent.volume_since_recent : 0,
                total_new_volume: totalVolume
                  ? Number(totalVolume.total_volume) + Number(volumeSinceRecent.volume_since_recent)
                  : volumeSinceRecent.volume_since_recent,
              });
            } catch (error) {
              logger.error(
                "all-time-volumes",
                `Error while calculating all time volume. collectionId=${row.id}, error=${error}`
              );

              return false;
            }
          }
        })
      );

      // filter out errors
      recentVolumes = recentVolumes.filter((v) => v);

      if (!recentVolumes.length) {
        return true;
      }

      // Step 3: Update the volumes in collections
      const queries: PgPromiseQuery[] = [];
      recentVolumes.forEach((values: any) => {
        queries.push({
          query: `
          UPDATE collections
          SET all_time_volume = $/total_new_volume/,
            day7_volume = CASE WHEN day7_volume < $/volume_since_recent/ THEN $/volume_since_recent/ ELSE day7_volume END,
            day30_volume = CASE WHEN day30_volume < $/volume_since_recent/ THEN $/volume_since_recent/ ELSE day30_volume END,
            updated_at = now()
          WHERE id = $/collection_id/
        `,
          values: values,
        });
      });

      const concat = pgp.helpers.concat(queries);
      await idb.none(concat);

      return true;
    } catch (error: any) {
      logger.error(
        "all-time-volumes",
        JSON.stringify({
          message: `Error while updating all time volumes. error=${JSON.stringify(error)}`,
          error,
        })
      );

      return false;
    }
  }

  /**
   * Update the collections table (fields day1_volume, day1_rank, etc) with latest values we have from daily_volumes
   *
   * @return boolean Returns false when it fails to update the collection, will need to reschedule the job
   */
  public static async updateCollections(
    useCleanValues = false,
    collectionId = ""
  ): Promise<boolean> {
    // Skip the query when the collection_id = -1
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    const dateTimestamp = date.getTime();
    const day7Timestamps = [
      dateTimestamp / 1000 - 7 * 24 * 3600,
      dateTimestamp / 1000 - 6 * 24 * 3600,
    ];

    // the beginning of the day 30 days ago to the end of that day
    const day30Timestamps = [
      dateTimestamp / 1000 - 30 * 24 * 3600,
      dateTimestamp / 1000 - 29 * 24 * 3600,
    ];

    const valuesPostfix = useCleanValues ? "_clean" : "";
    let day7Volumes: any = [];
    let day30Volumes: any = [];
    let allTimeVolumes: any = [];

    let day7Results: any = [];
    let day30Results: any = [];
    let allTimeResults: any = [];

    // get volumes for last 7 days, 30 days and all time

    const volumeQuery = `
      SELECT
        collection_id,
        SUM(volume${valuesPostfix}) AS $1:name
      FROM daily_volumes
      WHERE timestamp >= $2
      AND collection_id != '-1'
      ${collectionId ? `AND collection_id = $3` : ""}
      GROUP BY collection_id
    `;
    try {
      day7Volumes = await redb.manyOrNone(volumeQuery, [
        "day7_volume",
        day7Timestamps[0],
        collectionId,
      ]);
    } catch (error) {
      logger.error(
        "daily-volumes",
        `Error while getting 7day volume results. collectionId=${collectionId}`
      );
    }

    try {
      day30Volumes = await redb.manyOrNone(volumeQuery, [
        "day30_volume",
        day30Timestamps[0],
        collectionId,
      ]);
    } catch (error) {
      logger.error(
        "daily-volumes",
        `Error while getting 30day volume results. collectionId=${collectionId}`
      );
    }

    try {
      allTimeVolumes = await redb.manyOrNone(volumeQuery, ["all_time_volume", 0, collectionId]);
    } catch (error) {
      logger.error(
        "daily-volumes",
        `Error while getting all_time volume results. collectionId=${collectionId}`
      );
    }

    // Get 7, 30, all_time days previous data
    const query = `
        SELECT 
               collection_id,
               RANK() OVER (ORDER BY SUM(volume${valuesPostfix}) DESC, "collection_id") $1:name,
               MIN(floor_sell_value${valuesPostfix}) AS $2:name
        FROM daily_volumes
        WHERE timestamp < $3 AND timestamp >= $4
        AND collection_id != '-1'
        ${collectionId ? `AND collection_id = $5` : ""}
        GROUP BY collection_id
      `;

    try {
      day7Results = await redb.manyOrNone(query, [
        "day7_rank",
        "day7_floor_sell_value",
        day7Timestamps[1],
        day7Timestamps[0],
        collectionId,
      ]);
    } catch (error: any) {
      logger.error(
        "daily-volumes",
        `Error while calculating 7 day daily volumes. dateTimestamp=${dateTimestamp}, day7Timestamps=${day7Timestamps}, error=${error}`
      );

      return false;
    }

    try {
      day30Results = await redb.manyOrNone(query, [
        "day30_rank",
        "day30_floor_sell_value",
        day30Timestamps[1],
        day30Timestamps[0],
        collectionId,
      ]);
    } catch (error: any) {
      logger.error(
        "daily-volumes",
        `Error while calculating 30 day daily volumes. dateTimestamp=${dateTimestamp}, day30Timestamps=${day30Timestamps}, error=${error}`
      );

      return false;
    }

    try {
      allTimeResults = await redb.manyOrNone(query, [
        "all_time_rank",
        "all_time_floor_sell_value",
        // 9999999999999 is the max timestamp we can store in postgres, so we use it to get all the data
        9999999999999,
        0,
        collectionId,
      ]);
    } catch (error: any) {
      logger.error(
        "daily-volumes",
        `Error while calculating all time daily volumes. dateTimestamp=${dateTimestamp}, error=${error}`
      );

      return false;
    }

    const mergedArr = this.mergeArrays(
      day7Results,
      day30Results,
      allTimeResults,
      day7Volumes,
      day30Volumes,
      allTimeVolumes
    );

    if (!mergedArr.length) {
      // For specific collection it could be there's no volume
      if (collectionId) {
        return true;
      }

      logger.error(
        "daily-volumes",
        `No daily volumes found for 1, 7 and 30 days. Should be impossible. dateTimestamp=${dateTimestamp}`
      );

      return false;
    }

    try {
      const queries: { query: string; values: any }[] = [];
      mergedArr.forEach((row: any) => {
        // When updating single collection don't update the rank
        queries.push({
          query: `
            UPDATE collections
            SET
                day7_volume = $/day7_volume/,
                ${collectionId ? "" : `day7_rank = $/day7_rank/,`}
                day30_volume = $/day30_volume/,
                ${collectionId ? "" : `day30_rank = $/day30_rank/,`}
                all_time_volume = $/all_time_volume/,
                ${collectionId ? "" : `all_time_rank = $/all_time_rank/,`}
                updated_at = now()
            WHERE id = $/collection_id/
            AND (
            day7_volume IS DISTINCT FROM $/day7_volume/
            ${collectionId ? "" : `OR day7_rank IS DISTINCT FROM $/day7_rank/`}
            OR day30_volume IS DISTINCT FROM $/day30_volume/
            ${collectionId ? "" : `OR day30_rank IS DISTINCT FROM $/day30_rank/`}
            OR all_time_volume IS DISTINCT FROM $/all_time_volume/
            ${collectionId ? "" : `OR all_time_rank IS DISTINCT FROM $/all_time_rank/`}
            )`,
          values: row,
        });
      });

      for (const query of _.chunk(queries, 100)) {
        await idb.none(pgp.helpers.concat(query));
      }

      // for each collection, save the all time volume in redis, and set it to expire in 24 hours
      const allTimeVolumesByCollection = _.groupBy(mergedArr, "collection_id");
      for (const collectionId of Object.keys(allTimeVolumesByCollection)) {
        const volume = allTimeVolumesByCollection[collectionId][0].all_time_volume;
        await redis.set(`all_time_volume_${collectionId}`, volume, "EX", 24 * 60 * 60);
      }
    } catch (error: any) {
      logger.error(
        "daily-volumes",
        `Error while calculating the daily volumes for insertion into the collections table. dateTimestamp=${dateTimestamp}, error=${error}`
      );

      return false;
    }

    try {
      if (!(await DailyVolume.calculateVolumeChange(1, useCleanValues))) {
        return false;
      }
      if (!(await DailyVolume.calculateVolumeChange(7, useCleanValues))) {
        return false;
      }
      if (!(await DailyVolume.calculateVolumeChange(30, useCleanValues))) {
        return false;
      }

      if (!(await DailyVolume.cacheFloorSalePrice(1, useCleanValues))) {
        return false;
      }
      if (!(await DailyVolume.cacheFloorSalePrice(7, useCleanValues))) {
        return false;
      }
      if (!(await DailyVolume.cacheFloorSalePrice(30, useCleanValues))) {
        return false;
      }
    } catch (error: any) {
      logger.error(
        "daily-volumes",
        `Error while calculating volume changes. dateTimestamp=${dateTimestamp}, error=${error}`
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
  public static async calculateVolumeChange(
    days: number,
    useCleanValues = false
  ): Promise<boolean> {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    const timeDiff = days * 24 * 3600;

    const dateTimestamp = date.getTime();
    const currentPeriod = dateTimestamp / 1000 - timeDiff; // The last 1, 7, 30 days
    const previousPeriod = currentPeriod - timeDiff; // The period before the last 1, 7, 30 days
    const valuesPostfix = useCleanValues ? "_clean" : "";

    logger.info(
      "daily-volumes",
      `running calculateVolumeChange. dateTimestamp=${dateTimestamp}, days=${days}, currentPeriod=${currentPeriod}, previousPeriod=${previousPeriod}, useCleanValues=${useCleanValues}`
    );

    const query = `
        SELECT 
               collection_id,               
               SUM(volume${valuesPostfix}) AS $1:name              
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
    } catch (error: any) {
      logger.error(
        "daily-volumes",
        `Error while calculating the previous period volume. dateTimestamp=${dateTimestamp}, days=${days}, currentPeriod=${currentPeriod}, previousPeriod=${previousPeriod}, useCleanValues=${useCleanValues}, error=${error}`
      );

      return false;
    }

    if (!results.length) {
      logger.error(
        "daily-volumes",
        `No previous period data found for day${days} with timestamps between ${previousPeriod} and ${currentPeriod}. dateTimestamp=${dateTimestamp}`
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
            WHERE id = $/collection_id/
            AND (day${days}_volume_change IS DISTINCT FROM day${days}_volume / NULLIF($/prev_day${days}_volume/::numeric, 0))`,
        values: row,
      });
    });

    try {
      await idb.none(pgp.helpers.concat(queries));
    } catch (error: any) {
      logger.error(
        "daily-volumes",
        `Error while updating the previous period volume in the collections table. dateTimestamp=${dateTimestamp}, days=${days}, currentPeriod=${currentPeriod}, previousPeriod=${previousPeriod}, useCleanValues=${useCleanValues}, error=${error}`
      );

      return false;
    }

    logger.info(
      "daily-volumes",
      `Finished calculateVolumeChange. dateTimestamp=${dateTimestamp}, days=${days}, currentPeriod=${currentPeriod}, previousPeriod=${previousPeriod}, useCleanValues=${useCleanValues}`
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
  public static async cacheFloorSalePrice(
    period: number,
    useCleanValues = false
  ): Promise<boolean> {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);

    const timeDiff = period * 24 * 3600;
    const dateTimestamp = date.getTime();
    const dayToFetch = dateTimestamp / 1000 - timeDiff;
    const valuesPostfix = useCleanValues ? "_clean" : "";

    logger.info(
      "daily-volumes",
      `Running cacheFloorSalePrice. period=${period}, dateTimestamp=${dateTimestamp}, dayToFetch=${dayToFetch}, useCleanValues=${useCleanValues}`
    );

    const query = `
        SELECT 
               collection_id,               
               floor_sell_value${valuesPostfix} AS floor_sell_value
        FROM daily_volumes
        WHERE timestamp = $1              
            AND collection_id != '-1'        
      `;

    let results: any = [];
    try {
      results = await redb.manyOrNone(query, [dayToFetch]);
    } catch (error: any) {
      logger.error(
        "daily-volumes",
        `Error fetching the floor_sell_value of day ${dayToFetch}. period=${period}, dateTimestamp=${dateTimestamp}, dayToFetch=${dayToFetch}, useCleanValues=${useCleanValues}, error=${error}`
      );

      return false;
    }

    if (!results.length) {
      logger.error(
        "daily-volumes",
        `No floor_sell_value found for day ${dayToFetch}. period=${period}, dateTimestamp=${dateTimestamp}, dayToFetch=${dayToFetch}, useCleanValues=${useCleanValues}`
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
            WHERE id = $/collection_id/ AND (day${period}_floor_sell_value IS DISTINCT FROM $/floor_sell_value/)`,
        values: row,
      });
    });

    try {
      await idb.none(pgp.helpers.concat(queries));
    } catch (error) {
      logger.error(
        "daily-volumes",
        `Error while updating the floor_sell_value${valuesPostfix} of period ${period} in the collections table: ${error}`
      );
      return false;
    }

    logger.info(
      "daily-volumes",
      `Finished cacheFloorSalePrice for period ${period}. period=${period}, dateTimestamp=${dateTimestamp}, dayToFetch=${dayToFetch}, useCleanValues=${useCleanValues}`
    );

    return true;
  }

  /**
   * Merge the individual arrays of day summaries together, make sure all fields exist for each collection_id
   *
   * @param day7
   * @param day30
   */
  public static mergeArrays(
    day7: any,
    day30: any,
    allTime: any,
    day7Volumes: any,
    day30Volumes: any,
    allTimeVolumes: any
  ) {
    const map = new Map();
    day7.forEach((item: any) =>
      map.set(item.collection_id, { ...map.get(item.collection_id), ...item })
    );
    day30.forEach((item: any) =>
      map.set(item.collection_id, { ...map.get(item.collection_id), ...item })
    );
    allTime.forEach((item: any) =>
      map.set(item.collection_id, { ...map.get(item.collection_id), ...item })
    );

    day7Volumes.forEach((item: any) =>
      map.set(item.collection_id, { ...map.get(item.collection_id), ...item })
    );

    day30Volumes.forEach((item: any) =>
      map.set(item.collection_id, { ...map.get(item.collection_id), ...item })
    );

    allTimeVolumes.forEach((item: any) =>
      map.set(item.collection_id, { ...map.get(item.collection_id), ...item })
    );

    const mergedArr = Array.from(map.values());

    for (let x = 0; x < mergedArr.length; x++) {
      const row = mergedArr[x];

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

      if (!row["day7_rank"]) {
        row["day7_rank"] = null;
      }
      if (!row["day30_rank"]) {
        row["day30_rank"] = null;
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
