import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";

const QUEUE_NAME = "collection-set-community-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 5,
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
      const { collection, community } = job.data;

      const collectionData = await Collections.getById(collection);
      if (collectionData) {
        job.data.collectionFound = true;
        await Collections.update(collection, { community });
        logger.info(QUEUE_NAME, `Setting community ${community} to collection ${collection}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );

  worker.on("completed", async (job) => {
    const maxAttempts = 1500;
    const { collection, community, attempts } = job.data;

    if (attempts >= maxAttempts) {
      logger.warn(
        QUEUE_NAME,
        `Max attempts reached for setting community ${community} to collection ${collection}`
      );
    } else if (!job.data.collectionFound) {
      await addToQueue(collection, community, attempts + 1);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  collection: string,
  community: string,
  attempts = 0,
  delay = 5 * 60 * 1000
) => {
  await queue.add(collection, { collection, community, attempts }, { delay });
};
