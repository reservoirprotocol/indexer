import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

const QUEUE_NAME = "update-activities-collection-queue";

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

      const { contract, tokenId, newCollectionId, oldCollectionId } = job.data;

      const collection = await Collections.getById(newCollectionId);

      if (collection) {
        await ActivitiesIndex.updateActivitiesCollection(
          contract,
          tokenId,
          collection,
          oldCollectionId
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  contract: string,
  tokenId: string,
  newCollectionId: string,
  oldCollectionId: string
) => {
  await queue.add(
    `${contract}:${tokenId}:${newCollectionId}`,
    { contract, tokenId, newCollectionId, oldCollectionId },
    { jobId: `${contract}:${tokenId}:${newCollectionId}` }
  );
};
