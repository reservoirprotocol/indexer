/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero, HashZero } from "@ethersproject/constants";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
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
    async (job) => {
      const { address } = job.data;

      const results = await idb.manyOrNone(
        `
          SELECT
            sudoswap_pools.address
          FROM sudoswap_pools
          WHERE sudoswap_pools.address > $/address/
          LIMIT 50
        `,
        { address: toBuffer(address) }
      );

      for (let i = 0; i < results.length; i++) {
        const pool = fromBuffer(results[i].address);
        logger.info("debug", `Refreshing sudoswap order for pool ${pool} (${i})`);
        await save([
          {
            orderParams: {
              pool,
              txTimestamp: Math.floor(Date.now() / 1000),
              txHash: HashZero,
            },
            metadata: {},
          },
        ]);
      }

      if (results.length) {
        await addToQueue(fromBuffer(results[results.length - 1].address));
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock-4`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue(AddressZero);
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (address: string) => {
  await queue.add(randomUUID(), { address });
};
