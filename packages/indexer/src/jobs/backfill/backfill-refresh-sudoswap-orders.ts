/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import pLimit from "p-limit";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { save } from "@/orderbook/orders/sudoswap";

const QUEUE_NAME = "backfill-refresh-sudoswap-orders";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 5 * 60 * 1000,
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
          ORDER BY sudoswap_pools.address
          LIMIT 25
        `,
        { address: toBuffer(address) }
      );

      const block = await baseProvider.getBlock("latest").then((b) => b.number);

      const limit = pLimit(50);
      await Promise.all(
        results.map((r) =>
          limit(async () => {
            const pool = fromBuffer(r.address);
            await save([
              {
                orderParams: {
                  pool,
                  txTimestamp: Math.floor(Date.now() / 1000),
                  txHash: Math.random().toString(),
                  txBlock: block,
                  logIndex: 0,
                },
                metadata: {},
              },
            ]);
          })
        )
      );

      if (results.length) {
        await addToQueue(fromBuffer(results[results.length - 1].address));
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (address: string) => {
  await queue.add(randomUUID(), { address });
};
