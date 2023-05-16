/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import * as crypto from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import {
  PostOrderExternalParams,
  jobProcessor,
} from "@/jobs/orderbook/post-order-external/orderbook-post-order-external-queue";

const QUEUE_NAME = "orderbook-post-order-external-opensea-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 60000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(QUEUE_NAME, async (job: Job) => jobProcessor(job), {
    connection: redis.duplicate(),
    concurrency: 5,
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  postOrderExternalParams: PostOrderExternalParams,
  delay = 0,
  prioritized = false
) => {
  await queue.add(crypto.randomUUID(), postOrderExternalParams, {
    delay,
    priority: prioritized ? 1 : undefined,
  });
};
