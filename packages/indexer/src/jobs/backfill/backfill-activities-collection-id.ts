/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-activities-collection-id";

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
    async () => {
      const limit = 1000;
      const results = await idb.manyOrNone(
        `
              UPDATE activities SET
                collection_id = substring(x.token_set_id from 32)
              FROM (
                SELECT o.token_set_id, a.id as activityId
                FROM activities a JOIN orders o ON o.id = a.order_id 
                WHERE a.collection_id = 'collection-non-flagged'
                AND a.type = 'bid'
                LIMIT 1000
              ) x
              WHERE activities.id = x.activityId
              RETURNING activities.id
          `,
        {
          limit,
        }
      );

      if (results.length == limit) {
        await addToQueue();
      }

      logger.info(QUEUE_NAME, `Processed ${results.length} activities. limit=${limit}`);
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {}, { delay: 1000 });
};
