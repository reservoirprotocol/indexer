/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { randomUUID } from "crypto";

const QUEUE_NAME = "backfill-tokens-last-flag-update-queue";

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
      const limit = 100;
      try {
        const query = `
          UPDATE tokens
          SET last_flag_change = last_flag_update
          WHERE (contract, token_id) IN (SELECT t.contract, t.token_id FROM tokens t WHERE t.last_flag_change IS NULL AND t.last_flag_update IS NOT NULL and t.is_flagged = 1 LIMIT ${limit});
        `;
        const { rowCount } = await idb.result(query);
        if (rowCount >= limit) {
          logger.info(QUEUE_NAME, `Triggering next job.`);
          await addToQueue();
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed to update tokens' last_flag_change: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
