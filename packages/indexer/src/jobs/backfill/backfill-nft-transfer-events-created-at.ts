/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-nft-transfer-events-created-at";

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
      const limit = 1000;
      const results = await idb.result(
        `
            UPDATE nft_transfer_events nte SET
                created_at = to_timestamp(x.timestamp),
                updated_at = to_timestamp(x.timestamp)
            FROM (
                SELECT timestamp, tx_hash, log_index, batch_index
                FROM nft_transfer_events
                WHERE created_at IS NULL
                LIMIT 1000
            ) x
            WHERE nte.tx_hash = x.tx_hash AND nte.log_index = x.log_index AND nte.batch_index = x.batch_index
          `
      );

      if (results.rowCount == limit) {
        job.data.addToQueue = true;
      }

      logger.info(QUEUE_NAME, `Processed ${results.rowCount} events. limit=${limit}`);
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue();
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
