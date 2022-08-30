/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import pLimit from "p-limit";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { bn } from "@/common/utils";
import { config } from "@/config/index";
import { baseProvider } from "@/common/provider";
import * as transactionsModel from "@/models/transactions";

const QUEUE_NAME = "backfill-transactions";

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
      const { block } = job.data;

      const b = await baseProvider.getBlockWithTransactions(block);

      // Save all transactions within the block
      const limit = pLimit(20);
      await Promise.all(
        b.transactions.map((tx) =>
          limit(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rawTx = tx.raw as any;

            const gasPrice = tx.gasPrice?.toString();
            const gasUsed = rawTx?.gas ? bn(rawTx.gas).toString() : undefined;
            const gasFee = gasPrice && gasUsed ? bn(gasPrice).mul(gasUsed).toString() : undefined;

            await transactionsModel.saveTransaction({
              hash: tx.hash.toLowerCase(),
              from: tx.from.toLowerCase(),
              to: (tx.to || AddressZero).toLowerCase(),
              value: tx.value.toString(),
              data: tx.data.toLowerCase(),
              blockNumber: b.number,
              blockTimestamp: b.timestamp,
              gasPrice,
              gasUsed,
              gasFee,
            });
          })
        )
      );

      if (block <= 15180000) {
        await addToQueue(block + 1);
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
  //     await addToQueue(15050000);
  //   })
  //   .catch(() => {
  //     // Skip on any errors
  //   });
}

export const addToQueue = async (block: number) => {
  await queue.add(randomUUID(), { block });
};
