import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { Tokens } from "@/models/tokens";
import { AttributeKeys } from "@/models/attribute-keys";

const QUEUE_NAME = "resync-attribute-key-counts-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collection, key } = job.data;
      const attributeKeyCount = await Tokens.getTokenAttributesKeyCount(collection, key);

      // If there are no more token for the given key delete it
      if (!attributeKeyCount) {
        await AttributeKeys.delete(collection, key);

        logger.info(
          QUEUE_NAME,
          `Deleted from collection=${collection}, key=${key}, count=${attributeKeyCount}`
        );
      } else {
        await AttributeKeys.update(collection, key, { attributeCount: attributeKeyCount.count });

        logger.info(
          QUEUE_NAME,
          `Updated collection=${collection}, key=${key}, count=${attributeKeyCount.count}`
        );
      }
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

export const addToQueue = async (collection: string, key: string, delay = 60 * 60 * 1000) => {
  const jobId = `${collection}:${key}`;
  await queue.add(jobId, { collection, key }, { jobId, delay });
};
