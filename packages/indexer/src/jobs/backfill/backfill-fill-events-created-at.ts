/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-fill-events-created-at-queue";

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
      const limit = 200;

      const { rowCount } = await idb.result(
        `
            WITH x AS (
                SELECT "timestamp", log_index, batch_index 
                FROM fill_events_2
                WHERE created_at IS NULL
                LIMIT $/limit/
            )
            UPDATE fill_events_2 SET
              created_at = to_timestamp(x."timestamp")
            FROM x
            WHERE fill_events_2."timestamp" = x."timestamp"
            AND fill_events_2.log_index = x.log_index
            AND fill_events_2.batch_index = x.batch_index
          `,
        {
          limit,
        }
      );

      logger.info(QUEUE_NAME, `Updated ${rowCount} records`);

      if (rowCount > 0) {
        logger.info(QUEUE_NAME, `Triggering next job.`);
        await addToQueue();
      }
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
