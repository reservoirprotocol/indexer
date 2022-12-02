/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { save } from "@/orderbook/orders/sudoswap";

const QUEUE_NAME = "backfill-refresh-sudoswap-orders";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 10000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const results = await idb.manyOrNone(
        `
          SELECT
            orders.id,
            orders.raw_data->>'pair' AS pair,
            extract('epoch' FROM lower(orders.valid_between)) AS tx_timestamp
          FROM orders
          WHERE orders.kind = 'sudoswap'
            AND orders.contract IS NOT NULL
        `
      );
      for (let i = 0; i < results.length; i++) {
        logger.info("debug", `Refreshing sudoswap order ${results[i].id} (${i})`);
        await save([
          {
            orderParams: {
              pool: results[i].pair,
              txTimestamp: results[i].tx_timestamp,
              txHash: results[i].id,
            },
            metadata: {},
          },
        ]);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // !!! DISABLED

  // redlock
  //   .acquire([`${QUEUE_NAME}-lock`], 60 * 60 * 24 * 30 * 1000)
  //   .then(async () => {
  //     // await addToQueue();
  //   })
  //   .catch(() => {
  //     // Skip on any errors
  //   });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
