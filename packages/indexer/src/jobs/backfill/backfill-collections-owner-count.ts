/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import _ from "lodash";
import {
  recalcOwnerCountQueueJob,
  RecalcOwnerCountQueueJobPayload,
} from "@/jobs/collection-updates/recalc-owner-count-queue-job";

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
      job.data.addToQueue = false;

      const cursor = job.data.cursor as CursorInfo;
      let continuationFilter = "";

      const limit = (await redis.get(`${QUEUE_NAME}-limit`)) || 1;

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
        const recalcCollectionOwnerCountInfo: RecalcOwnerCountQueueJobPayload[] = results.map(
          (result) => ({
            context: QUEUE_NAME,
            kind: "collectionId",
            data: {
              collectionId: result.id,
            },
          })
        );

        await recalcOwnerCountQueueJob.addToQueue(recalcCollectionOwnerCountInfo);

        if (results.length == limit) {
          const lastResult = _.last(results);

          nextCursor = {
            collectionId: lastResult.id,
          };

          job.data.addToQueue = true;
          job.data.addToQueueCursor = nextCursor;
        }

        logger.info(QUEUE_NAME, `Triggered owner count recalc for ${results.length} collections`);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue(job.data.addToQueueCursor, 2000);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CursorInfo = {
  collectionId: string;
};

export const addToQueue = async (cursor?: CursorInfo, delay = 0) => {
  await queue.add(randomUUID(), { cursor }, { delay });
};
