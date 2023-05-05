/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-zero-address-balance";

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
      const results = await idb.result(
        `
            UPDATE nft_balances SET
                amount = 0
            FROM (
                SELECT contract, token_id, owner
                FROM nft_balances
                WHERE amount < 0 AND owner = '\\x0000000000000000000000000000000000000000'
                LIMIT 1000
            ) x
            WHERE nft_balances.contract = x.contract AND nft_balances.token_id = x.token_id AND nft_balances.owner = x.owner
        `
      );

      if (results.rowCount == limit) {
        await addToQueue();
      }

      logger.info(QUEUE_NAME, `Processed ${results.rowCount} balances. limit=${limit}`);
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
