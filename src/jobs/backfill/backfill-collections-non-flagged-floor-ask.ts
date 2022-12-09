/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import * as collectionUpdatesNonFlaggedFloorAsk from "@/jobs/collection-updates/non-flagged-floor-queue";
import _ from "lodash";

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
        continuationFilter = `WHERE (collections.id) > ($/collectionId/)`;
      }

      const results = await idb.oneOrNone(
        `
        SELECT collections.id FROM collections
        WHERE collections.floor_sell_id IS NOT NULL and collections.non_flagged_floor_sell_id IS NULL
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

          await collectionUpdatesNonFlaggedFloorAsk.addToQueue([
            {
              kind: "bootstrap",
              collectionId: result.id,
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

  redlock
    .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue();
    })
    .catch(() => {
      // Skip on any errors
    });
}

export type CursorInfo = {
  collectionId: string;
};

export const addToQueue = async (cursor?: CursorInfo) => {
  await queue.add(randomUUID(), { cursor }, { delay: 1000 });
};
