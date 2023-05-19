/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Activities } from "@/models/activities";
import { UserActivities } from "@/models/user-activities";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

const QUEUE_NAME = "remove-unsynced-events-activities-queue";

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
    async (job: Job) => {
      const { blockHash } = job.data;

      await Promise.all([
        Activities.deleteByBlockHash(blockHash),
        UserActivities.deleteByBlockHash(blockHash),
      ]);

      if (config.doElasticsearchWork) {
        await ActivitiesIndex.deleteActivitiesByBlockHash(blockHash);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (blockHash: string) => {
  await queue.add(randomUUID(), { blockHash });
};
