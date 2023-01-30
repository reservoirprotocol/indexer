import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { Attributes } from "@/models/attributes";
import { Tokens } from "@/models/tokens";

const QUEUE_NAME = "resync-attribute-value-counts-queue";

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
      const { collection, key, value } = job.data;
      const attributeValueCount = await Tokens.getTokenAttributesValueCount(collection, key, value);

      if (!attributeValueCount) {
        const attribute = await Attributes.getAttributeByCollectionKeyValue(collection, key, value);
        if (attribute) {
          await Attributes.delete(attribute.id);

          logger.debug(
            QUEUE_NAME,
            `Deleted from collection=${collection}, key=${key}, value=${value} attributeId=${attribute.id}`
          );
        }
      } else {
        await Attributes.update(attributeValueCount.attributeId, {
          tokenCount: attributeValueCount.count,
        });

        logger.debug(
          QUEUE_NAME,
          `Updated collection=${collection}, key=${key}, value=${value} attributeId=${attributeValueCount.attributeId}, count=${attributeValueCount.count}`
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

export const addToQueue = async (
  collection: string,
  key: string,
  value: string,
  delay = 60 * 60 * 1000
) => {
  const jobId = `${collection}:${key}:${value}`;
  await queue.add(jobId, { collection, key, value }, { jobId, delay });
};
