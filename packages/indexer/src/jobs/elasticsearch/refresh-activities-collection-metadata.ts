import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { Collections } from "@/models/collections";
import { randomUUID } from "crypto";

const QUEUE_NAME = "refresh-activities-collection-metadata-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
    timeout: 120000,
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
      const collectionId = job.data.collectionId;
      let collectionUpdateData = job.data.collectionData;

      if (!collectionUpdateData) {
        const collectionData = await Collections.getById(collectionId);

        if (collectionData) {
          collectionUpdateData = {
            name: collectionData.name,
            image: collectionData.metadata?.imageUrl,
          };
        }
      }

      if (collectionUpdateData) {
        const keepGoing = await ActivitiesIndex.updateActivitiesCollectionMetadata(
          collectionId,
          collectionUpdateData
        );

        if (keepGoing) {
          await addToQueue(collectionId, collectionUpdateData);
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  collectionId: string,
  collectionUpdateData?: { name: string | null; image?: string | null }
) => {
  await queue.add(randomUUID(), { collectionId, collectionUpdateData });
};
