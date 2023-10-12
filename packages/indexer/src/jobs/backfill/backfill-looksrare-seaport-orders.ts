import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-looksrare-seaport-orders";

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
      let startTime = 1692198000;
      const maxTime = 1692374400;

      while (startTime < maxTime) {
        await idb.none(
          `
            UPDATE orders SET source_id_int = 3
            WHERE kind = 'seaport-v1.5'
            AND updated_at > to_timestamp($/startTime/) AND updated_at < to_timestamp($/endTime/)
            AND raw_data::json->>'salt' LIKE '0xc4ac6e7e%'
            AND source_id_int != 3
          `,
          {
            startTime,
            endTime: startTime + 15 * 60,
          }
        );

        logger.info(
          QUEUE_NAME,
          `Worker debug. startTime=${new Date(startTime * 1000)}, endTime=${new Date(
            (startTime + 15 * 60) * 1000
          )}`
        );

        // Update in 15 minute intervals
        startTime += 15 * 60;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
