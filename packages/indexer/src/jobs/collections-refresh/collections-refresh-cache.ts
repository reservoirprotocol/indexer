/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";
import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";

const QUEUE_NAME = "collections-refresh-cache";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collection } = job.data;

      // Refresh the contract floor sell and top bid
      await Collections.revalidateCollectionTopBuy(collection);

      const result = await redb.manyOrNone(
        `
          SELECT
            tokens.contract,
            tokens.token_id
          FROM tokens
          WHERE tokens.collection_id = $/collection/
            AND tokens.floor_sell_id IS NOT NULL
          LIMIT 10000
        `,
        { collection }
      );
      if (result) {
        await Collections.recalculateContractFloorSell(fromBuffer(result[0].contract));
        for (const { contract, token_id } of result) {
          await resyncAttributeCacheJob.addToQueue(
            { contract: fromBuffer(contract), tokenId: token_id },
            0
          );
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collection: string) => {
  await queue.add(randomUUID(), { collection });
};
