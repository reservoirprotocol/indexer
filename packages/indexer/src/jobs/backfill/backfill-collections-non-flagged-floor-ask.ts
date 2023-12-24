/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import _ from "lodash";
import { fromBuffer } from "@/common/utils";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";

const QUEUE_NAME = "backfill-collections-non-flagged-floor-ask";

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
        continuationFilter = `AND (collections.id) > ($/collectionId/)`;
      }

      const results = await idb.manyOrNone(
        `
        SELECT 
            collections.id,
            token_sets_tokens.contract,
            token_sets_tokens.token_id,
            collections.non_flagged_floor_sell_id
        FROM collections
        JOIN orders ON orders.id = collections.floor_sell_id
        JOIN token_sets_tokens ON token_sets_tokens.token_set_id = orders.token_set_id
        WHERE collections.floor_sell_id IS NOT NULL
        ${continuationFilter}
        ORDER BY collections.id
        LIMIT $/limit/
          `,
        {
          collectionId: cursor?.collectionId,
          limit,
        }
      );

      let nextCursor;

      if (results.length) {
        for (const result of results) {
          logger.info(
            QUEUE_NAME,
            `Backfilling collection. tokenSetResult=${JSON.stringify(result)}`
          );

          await nonFlaggedFloorQueueJob.addToQueue([
            {
              kind: result.non_flagged_floor_sell_id ? "revalidation" : "bootstrap",
              contract: fromBuffer(result.contract),
              tokenId: result.token_id,
              txHash: null,
              txTimestamp: null,
            },
          ]);
        }

        if (results.length == limit) {
          const lastResult = _.last(results);

          nextCursor = {
            collectionId: lastResult.id,
          };

          await redis.set(`${QUEUE_NAME}-next-cursor`, JSON.stringify(nextCursor));

          await addToQueue(nextCursor);
        }
      }
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
  await queue.add(randomUUID(), { cursor });
};
