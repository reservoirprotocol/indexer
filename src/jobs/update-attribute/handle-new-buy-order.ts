import { randomUUID } from "crypto";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { Attributes } from "@/models/attributes";

const QUEUE_NAME = "handle-new-buy-order-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
    timeout: 60 * 1000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { attributeId, topBuyValue } = job.data as HandleBuyOrderParams;
      await Attributes.update(attributeId, {
        topBuyValue,
        buyUpdatedAt: new Date().toISOString(),
      });
    },
    {
      connection: redis.duplicate(),
      concurrency: 3,
    }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type HandleBuyOrderParams = {
  attributeId: number;
  topBuyValue: number | null;
};

export const addToQueue = async (params: HandleBuyOrderParams) => {
  await queue.add(randomUUID(), params);
};
