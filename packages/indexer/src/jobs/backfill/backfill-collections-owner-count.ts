/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import _ from "lodash";
import { RecalcCollectionOwnerCountInfo } from "@/jobs/collection-updates/recalc-owner-count-queue";
import * as collectionRecalcOwnerCount from "@/jobs/collection-updates/recalc-owner-count-queue";

const QUEUE_NAME = "backfill-collections-owner-count";

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
            collections.id
        FROM collections
        WHERE collections.owner_count IS NULL
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
        const recalcCollectionOwnerCountInfo: RecalcCollectionOwnerCountInfo[] = results.map(
          (result) => ({
            context: QUEUE_NAME,
            kind: "collectionId",
            data: {
              collectionId: result.id,
            },
          })
        );

        await collectionRecalcOwnerCount.addToQueue(recalcCollectionOwnerCountInfo);

        if (results.length == limit) {
          const lastResult = _.last(results);

          nextCursor = {
            collectionId: lastResult.id,
          };

          await redis.set(`${QUEUE_NAME}-next-cursor`, JSON.stringify(nextCursor));

          await addToQueue(nextCursor, 5000);
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock-v2`], 60 * 60 * 24 * 30 * 1000)
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

export const addToQueue = async (cursor?: CursorInfo, delay = 0) => {
  await queue.add(randomUUID(), { cursor }, { delay });
};
