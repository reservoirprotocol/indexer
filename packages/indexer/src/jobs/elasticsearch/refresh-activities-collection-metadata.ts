import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { Collections } from "@/models/collections";

const QUEUE_NAME = "refresh-activities-collection-metadata-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    backoff: {
      type: "fixed",
      delay: 5000,
    },
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      logger.info(QUEUE_NAME, `Worker started. jobData=${JSON.stringify(job.data)}`);

      const { collectionId } = job.data;

      const collectionData = await Collections.getById(collectionId);

      if (collectionData) {
        await ActivitiesIndex.updateActivitiesCollectionMetadata(collectionId, collectionData);
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collectionId: string) => {
  await queue.add(`${collectionId}`, { collectionId }, { jobId: `${collectionId}` });
};
