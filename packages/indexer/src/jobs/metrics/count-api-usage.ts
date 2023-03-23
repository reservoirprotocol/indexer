import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { metricsRedis } from "@/common/redis";
import { config } from "@/config/index";
import { randomUUID } from "crypto";
import { ApiUsageCounter } from "@/models/api-usage-counter";

const QUEUE_NAME = `count-api-usage-queue-${config.chainId}`;

export const queue = new Queue(QUEUE_NAME, {
  connection: metricsRedis.duplicate(),
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: metricsRedis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { apiKey, route, statusCode, points, timestamp } = job.data as ApiUsageInfo;
      await ApiUsageCounter.count(apiKey, route, statusCode, points, timestamp);
    },
    { connection: metricsRedis.duplicate(), concurrency: 30 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type ApiUsageInfo = {
  apiKey: string;
  route: string;
  statusCode: number;
  points: number;
  timestamp: number;
};

export const addToQueue = async (info: ApiUsageInfo) => {
  await queue.add(randomUUID(), info);
};
