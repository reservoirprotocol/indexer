/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-bid-activities-collection-id";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      let cursor = job.data.cursor as CursorInfo;
      let continuationFilter = "";

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 1;

      if (!cursor) {
        const cursorJson = await redis.get(`${QUEUE_NAME}-next-cursor`);

        if (cursorJson) {
          cursor = JSON.parse(cursorJson);
        }
      }

      if (cursor) {
        continuationFilter = ` AND (a.id) > ($/activityId/)`;
      }

      const results = await idb.manyOrNone(
        `
                UPDATE activities SET
                                collection_id = x."collectionId"
                              FROM (
                SELECT
                a.id as "activityId", o."collectionId"
                FROM activities a
                LEFT JOIN LATERAL (
                                SELECT 
                                    (
                          CASE
                            WHEN orders.token_set_id LIKE 'token:%' THEN
                              (SELECT
                                collections.id              FROM tokens
                              JOIN collections
                                ON tokens.collection_id = collections.id
                              WHERE tokens.contract = decode(substring(split_part(orders.token_set_id, ':', 2) from 3), 'hex')
                                AND tokens.token_id = (split_part(orders.token_set_id, ':', 3)::NUMERIC(78, 0)))
                
                            WHEN orders.token_set_id LIKE 'contract:%' THEN
                              (SELECT
                                collections.id              FROM collections
                              WHERE collections.id = substring(orders.token_set_id from 10))
                
                            WHEN orders.token_set_id LIKE 'range:%' THEN
                              (SELECT
                                collections.id              FROM collections
                              WHERE collections.id = substring(orders.token_set_id from 7))
                
                            WHEN orders.token_set_id LIKE 'list:%' THEN
                              (SELECT
                                CASE
                                  WHEN token_sets.attribute_id IS NULL THEN
                                    (SELECT
                                      collections.id
                                    FROM collections
                                    WHERE token_sets.collection_id = collections.id)
                                  ELSE
                                    (SELECT
                                      collections.id                    FROM attributes
                                    JOIN attribute_keys
                                    ON attributes.attribute_key_id = attribute_keys.id
                                    JOIN collections
                                    ON attribute_keys.collection_id = collections.id
                                    WHERE token_sets.attribute_id = attributes.id)
                                END  
                              FROM token_sets
                              WHERE token_sets.id = orders.token_set_id AND token_sets.schema_hash = orders.token_set_schema_hash)
                            ELSE a.collection_id
                          END
                        ) AS "collectionId"
                                FROM orders
                                WHERE a.order_id = orders.id
                             ) o ON TRUE
                WHERE a.type = 'bid' and a.collection_id is null
                ${continuationFilter}
                ORDER BY a.id
                LIMIT $/limit/
              ) x
              WHERE activities.id = x."activityId"
              RETURNING activities.id
          `,
        {
          activityId: cursor?.activityId,
          limit,
        }
      );

      let nextCursor;

      if (results.length == limit) {
        const lastResult = _.last(results);

        nextCursor = {
          activityId: lastResult.id,
        };

        await redis.set(`${QUEUE_NAME}-next-cursor`, JSON.stringify(nextCursor));

        await addToQueue(nextCursor);
      }

      logger.info(
        QUEUE_NAME,
        `Processed ${results.length} activities.  limit=${limit}, cursor=${JSON.stringify(
          cursor
        )}, nextCursor=${JSON.stringify(nextCursor)}`
      );
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // !!! DISABLED

  // redlock
  //   .acquire([`${QUEUE_NAME}-lock-v2`], 60 * 60 * 24 * 30 * 1000)
  //   .then(async () => {
  //     await addToQueue();
  //   })
  //   .catch(() => {
  //     // Skip on any errors
  //   });
}

export type CursorInfo = {
  activityId: number;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 1000 });
};
