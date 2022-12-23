import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as tokenListSet from "@/orderbook/token-sets/token-list";

const QUEUE_NAME = "orderbook-token-sets-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 30000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { id, schemaHash, schema, items } = job.data as tokenListSet.TokenSet;

      try {
        await tokenListSet.save([{ id, schemaHash, schema, items }]);
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed to process order ${JSON.stringify(job.data)}: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (tokenSets: tokenListSet.TokenSet[]) => {
  await queue.addBulk(
    tokenSets.map((tokenSet) => ({
      name: tokenSet.id,
      data: tokenSet,
    }))
  );
};
