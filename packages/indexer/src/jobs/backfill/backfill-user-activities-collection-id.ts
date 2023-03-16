/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-user-activities-collection-id";

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
              UPDATE user_activities SET
                collection_id = substring(x.token_set_id from 32)
              FROM (
                SELECT o.token_set_id, ua.id as activityId
                FROM user_activities ua JOIN orders o ON o.id = ua.order_id 
                WHERE ua.collection_id = 'collection-non-flagged'
                AND ua.type = 'bid'
                LIMIT 1000
              ) x
              WHERE user_activities.id = x.activityId
              RETURNING user_activities.id
          `,
        {
          limit,
        }
      );

      if (results.length == limit) {
        await addToQueue();
      }

      logger.info(QUEUE_NAME, `Processed ${results.length} user_activities. limit=${limit}`);
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
