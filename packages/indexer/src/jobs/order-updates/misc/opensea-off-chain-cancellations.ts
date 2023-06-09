import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "opensea-off-chain-cancellations";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { orderId } = job.data as { orderId: string };

      logger.info(QUEUE_NAME, JSON.stringify({ orderId }));
    },
    { connection: redis.duplicate(), concurrency: 30 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (orderId: string) => {
  await queue.add(
    orderId,
    { orderId },
    {
      jobId: orderId,
      // Delay for 5 seconds to allow any on-chain events to get processed first
      // (OpenSea doesn't return the invalidation reason and we only want to add
      // custom logic for off-chain cancellations)
      delay: 5 * 1000,
    }
  );
};
