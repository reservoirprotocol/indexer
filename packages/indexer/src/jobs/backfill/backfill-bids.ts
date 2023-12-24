/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { MqJobsDataManager } from "@/models/mq-jobs-data";
import _ from "lodash";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";
import { GenericOrderInfo } from "@/jobs/orderbook/utils";

const QUEUE_NAME = "backfill-bids-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { id } = job.data;
      const orderInfoBatch = (await MqJobsDataManager.getJobData(id)) as GenericOrderInfo[];

      if (!_.isEmpty(orderInfoBatch)) {
        await orderbookOrdersJob.addToQueue(
          _.isArray(orderInfoBatch) ? orderInfoBatch : [orderInfoBatch]
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("completed", async (job) => {
    const { id } = job.data;
    await MqJobsDataManager.deleteJobData(id);
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (id: string) => {
  await queue.add(randomUUID(), { id });
};
