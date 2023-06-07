/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Activities } from "@/models/activities";
import { UserActivities } from "@/models/user-activities";
import { Collections } from "@/models/collections";

import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

const QUEUE_NAME = "fix-activities-missing-collection-queue";
const MAX_RETRIES = 5;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: true,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      // Temporarily disable goerli prod
      if (config.chainId === 5 && config.environment === "prod") {
        return;
      }
      const { contract, tokenId, retry } = job.data;
      const collection = await Collections.getByContractAndTokenId(contract, tokenId);

      job.data.addToQueue = false;

      if (collection) {
        // Update the collection id of any missing activities
        await Promise.all([
          Activities.updateMissingCollectionId(contract, tokenId, collection.id),
          UserActivities.updateMissingCollectionId(contract, tokenId, collection.id),
        ]);

        if (config.doElasticsearchWork) {
          await ActivitiesIndex.updateActivitiesMissingCollection(contract, tokenId, collection);
        }
      } else if (retry < MAX_RETRIES) {
        job.data.addToQueue = true;
      } else {
        logger.debug(QUEUE_NAME, `Max retries reached for ${JSON.stringify(job.data)}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      const retry = job.data.retry + 1;
      await addToQueue(job.data.contract, job.data.tokenId, retry);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (contract: string, tokenId: string, retry = 0) => {
  const jobId = `${contract}:${tokenId}`;
  const delay = retry ? retry ** 2 * 300 * 1000 : 0;

  await queue.add(
    randomUUID(),
    {
      contract,
      tokenId,
      retry,
    },
    {
      jobId,
      delay,
    }
  );
};
