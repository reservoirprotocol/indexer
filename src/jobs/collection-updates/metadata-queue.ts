import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import _ from "lodash";
import { logger } from "@/common/logger";
import { redis, acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";
import { refreshEIP2981Royalties } from "@/utils/royalties/eip2981";

const QUEUE_NAME = "collections-metadata-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { contract, tokenId } = job.data;

      if (await acquireLock(QUEUE_NAME, 1)) {
        logger.info(QUEUE_NAME, `Refresh collection metadata=${contract}`);
        await acquireLock(`${QUEUE_NAME}:${contract}`, 60 * 60); // lock this contract for the next hour

        try {
          await Collections.updateCollectionCache(contract, tokenId);
          await refreshEIP2981Royalties(contract);
        } catch (error) {
          logger.error(QUEUE_NAME, `Failed to update collection metadata=${error}`);
        }
      } else {
        job.data.addToQueue = true;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job: Job) => {
    if (job.data.addToQueue) {
      const { contract, tokenId } = job.data;
      await addToQueue(contract, tokenId, 1000);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (contract: string | string[], tokenId = "1", delay = 0) => {
  if (_.isArray(contract)) {
    await queue.addBulk(
      _.map(contract, (c) => ({
        name: randomUUID(),
        data: { contract: c, tokenId },
        opts: { delay },
      }))
    );
  } else {
    if (_.isNull(await redis.get(`${QUEUE_NAME}:${contract}`))) {
      await queue.add(randomUUID(), { contract, tokenId }, { delay });
    }
  }
};
