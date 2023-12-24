/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-collections-top-bid-queue";

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
        continuationFilter = `WHERE (c.id) > ($/collectionId/)`;
      }

      const results = await idb.manyOrNone(
        `
              UPDATE collections SET
                top_buy_id = x.top_buy_id,
                top_buy_value = x.top_buy_value,
                top_buy_maker = x.top_buy_maker,
                top_buy_source_id_int = x.source_id_int,
                top_buy_valid_between = x.valid_between,
                updated_at = now()
              FROM (
                SELECT c.id as collectionId, y.*
                FROM collections c
                LEFT JOIN LATERAL (
                    SELECT
                      "ts"."top_buy_id",
                      "ts"."top_buy_value",
                      "ts"."top_buy_maker",
                       "ob"."source_id_int",
                      "ob"."valid_between"
                    FROM "token_sets" "ts"
                    LEFT JOIN "orders" "ob"
                      ON "ts"."top_buy_id" = "ob"."id"
                    WHERE "ts"."id" = "c"."token_set_id"
                    ORDER BY "ts"."top_buy_value" DESC NULLS LAST
                    LIMIT 1
                   ) "y" ON TRUE
                ${continuationFilter}
                ORDER BY c.id
                LIMIT $/limit/
              ) x
              WHERE collections.id = x.collectionId
              RETURNING collections.id
          `,
        {
          collectionId: cursor?.collectionId,
          limit,
        }
      );

      let nextCursor;

      if (results.length == limit) {
        const lastResult = _.last(results);

        nextCursor = {
          collectionId: lastResult.id,
        };

        await redis.set(`${QUEUE_NAME}-next-cursor`, JSON.stringify(nextCursor));

        await addToQueue(nextCursor);
      }

      logger.info(
        QUEUE_NAME,
        `Processed ${results.length} collections.  limit=${limit}, cursor=${JSON.stringify(
          cursor
        )}, nextCursor=${JSON.stringify(nextCursor)}`
      );
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CursorInfo = {
  collectionId: string;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 1000 });
};
