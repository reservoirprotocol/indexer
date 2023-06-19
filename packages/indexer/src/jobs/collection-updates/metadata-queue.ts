import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { logger } from "@/common/logger";
import { redis, acquireLock, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";

export const QUEUE_NAME = "collections-metadata-queue";

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
      const { contract, tokenId, community, forceRefresh } = job.data;

      if (forceRefresh || (await acquireLock(`${QUEUE_NAME}:${contract}`, 5 * 60))) {
        if (await acquireLock(QUEUE_NAME, 1)) {
          try {
            if (isNaN(Number(tokenId)) || tokenId == null) {
              logger.error(
                QUEUE_NAME,
                `Invalid tokenId. contract=${contract}, tokenId=${tokenId}, community=${community}`
              );
            }

            await Collections.updateCollectionCache(contract, tokenId, community);
          } catch (error) {
            logger.error(
              QUEUE_NAME,
              JSON.stringify({
                message: "updateCollectionCache error",
                jobData: job.data,
                error,
              })
            );
          }
        } else {
          job.data.addToQueue = true;

          if (!forceRefresh) {
            await releaseLock(`${QUEUE_NAME}:${contract}`);
          }
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 20 }
  );

  worker.on("completed", async (job: Job) => {
    if (job.data.addToQueue) {
      const { contract, tokenId, community } = job.data;
      await addToQueue(contract, tokenId, community, 1000, false, QUEUE_NAME);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CollectionMetadataInfo = {
  contract: string;
  tokenId: string;
  community: string;
  forceRefresh?: boolean;
};

export const addToQueueBulk = async (
  collectionMetadataInfos: CollectionMetadataInfo[],
  delay = 0,
  context?: string
) => {
  collectionMetadataInfos.forEach((collectionMetadataInfo) => {
    if (isNaN(Number(collectionMetadataInfo.tokenId)) || collectionMetadataInfo.tokenId == null) {
      logger.error(
        QUEUE_NAME,
        `Invalid tokenId. collectionMetadataInfo=${JSON.stringify(
          collectionMetadataInfo
        )}, context=${context}`
      );
    }
  });

  await queue.addBulk(
    collectionMetadataInfos.map((collectionMetadataInfo) => ({
      name: `${collectionMetadataInfo.contract}-${collectionMetadataInfo.tokenId}-${collectionMetadataInfo.community}`,
      data: collectionMetadataInfo,
      opts: { delay },
    }))
  );
};

export const addToQueue = async (
  contract: string | { contract: string; community: string }[],
  tokenId = "1",
  community = "",
  delay = 0,
  forceRefresh = false,
  context?: string
) => {
  if (isNaN(Number(tokenId)) || tokenId == null) {
    logger.error(
      QUEUE_NAME,
      `Invalid tokenId. contract=${contract}, tokenId=${tokenId}, community=${community}, context=${context}`
    );
  }

  if (_.isArray(contract)) {
    await queue.addBulk(
      _.map(contract, (c) => ({
        name: randomUUID(),
        data: { contract: c.contract, tokenId, community: c.community, forceRefresh },
        opts: { delay },
      }))
    );
  } else {
    await queue.add(randomUUID(), { contract, tokenId, community, forceRefresh }, { delay });
  }
};
