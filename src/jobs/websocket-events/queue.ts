import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import {
  TokenSetTopBidEventData,
  UserTopBidEvent,
} from "@/jobs/websocket-events/events/user-top-bid-event";
import { randomUUID } from "crypto";

const QUEUE_NAME = "websocket-events-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { orderId } = job.data as TokenSetTopBidEventData;

      await UserTopBidEvent.handleEvent({
        orderId,
      });
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (data: TokenSetTopBidEventData) => {
  await queue.add(randomUUID(), data);
};
