/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";

const QUEUE_NAME = "backfill-collections-payment-tokens";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
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
      const limit = 10;
      const result = await idb.manyOrNone(
        `
          SELECT
            collections.contract,
            (SELECT tokens.token_id FROM tokens WHERE tokens.collection_id = collections.id LIMIT 1) AS token_id
          FROM collections
          WHERE collections.payment_tokens IS NULL
          AND collections.day30_rank <= 1000
          LIMIT $/limit/
        `,
        { limit }
      );

      for (const { contract, token_id } of result) {
        await Collections.updateCollectionCache(fromBuffer(contract), token_id);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (result.length == limit) {
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
  await queue.add(randomUUID(), {});
};
