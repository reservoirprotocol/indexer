import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { orderbookRedis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import { GenericOrderInfo, jobProcessor } from "@/jobs/orderbook/orders-queue";

const QUEUE_NAME = "orderbook-orders-queue-v2";

export const queue = new Queue(QUEUE_NAME, {
  connection: orderbookRedis.duplicate(),
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

new QueueScheduler(QUEUE_NAME, { connection: orderbookRedis.duplicate(), maxStalledCount: 20 });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(QUEUE_NAME, async (job: Job) => jobProcessor(job), {
    connection: orderbookRedis.duplicate(),
    concurrency: 40,
  });
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // Every minute we check the size of the orders queue. This will
  // ensure we get notified when it's buffering up and potentially
  // blocking the real-time flow of orders.
  cron.schedule(
    "*/1 * * * *",
    async () =>
      await redlock
        .acquire([`${QUEUE_NAME}-size-check-lock`], (60 - 5) * 1000)
        .then(async () => {
          const size = await queue.count();
          if (size >= 20000) {
            logger.error(
              `${QUEUE_NAME}-size-check`,
              `Opensea listings queue buffering up: size=${size}`
            );
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}

export const addToQueue = async (
  orderInfos: GenericOrderInfo[],
  prioritized = false,
  delay = 0,
  jobId?: string
) => {
  await queue.addBulk(
    orderInfos.map((orderInfo) => ({
      name: randomUUID(),
      data: orderInfo,
      opts: {
        priority: prioritized ? 1 : undefined,
        delay: delay ? delay * 1000 : undefined,
        jobId,
      },
    }))
  );
};
