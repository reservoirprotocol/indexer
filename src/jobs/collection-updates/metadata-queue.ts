import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { logger } from "@/common/logger";
import { redis, acquireLock } from "@/common/redis";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";

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
      const { collectionId, contract, tokenId, community } = job.data;

      logger.info(
        QUEUE_NAME,
        `Refresh collection metadata start. collectionId=${collectionId}, contract=${contract}, tokenId=${tokenId}, community=${community}`
      );

      logger.info(
        QUEUE_NAME,
        `Refresh collection metadata start. contract=${contract}, tokenId=${tokenId}, community=${community}`
      );

      if (await acquireLock(QUEUE_NAME, 1)) {
        logger.info(
          QUEUE_NAME,
          `Refresh collection metadata - got lock. collectionId=${collectionId}, contract=${contract}, tokenId=${tokenId}, community=${community}`
        );

        // Lock this contract for the next 5 minutes
        await acquireLock(`${QUEUE_NAME}:${collectionId}`, 5 * 60);

        try {
          await Collections.updateCollectionCache(contract, tokenId, community);
        } catch (error) {
          logger.error(
            QUEUE_NAME,
            `Failed to update collection metadata. collectionId=${collectionId}, contract=${contract}, tokenId=${tokenId}, community=${community}, error=${error}`
          );
        }
      } else {
        logger.info(
          QUEUE_NAME,
          `Refresh collection metadata - delayed. collectionId=${collectionId}, contract=${contract}, tokenId=${tokenId}, community=${community}`
        );

        job.data.addToQueue = true;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job: Job) => {
    if (job.data.addToQueue) {
      const { collectionId, contract, tokenId, community } = job.data;
      await addToQueue(collectionId, contract, tokenId, community, 1000);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type CollectionMetadataInfo = {
  collectionId: string;
  contract: string;
  tokenId: string;
  community: string;
};

export const addToQueueBulk = async (
  collectionMetadataInfos: CollectionMetadataInfo[],
  delay = 0
) => {
  await queue.addBulk(
    collectionMetadataInfos.map((collectionMetadataInfo) => ({
      name: `${collectionMetadataInfo.collectionId}-${collectionMetadataInfo.contract}-${collectionMetadataInfo.tokenId}-${collectionMetadataInfo.community}`,
      data: collectionMetadataInfo,
      opts: { delay },
    }))
  );
};

export const addToQueue = async (
  collectionId: string,
  contract: string,
  tokenId = "1",
  community = "",
  delay = 0,
  forceRefresh = false
) => {
  if (forceRefresh || _.isNull(await redis.get(`${QUEUE_NAME}:${collectionId}`))) {
    logger.info(
      QUEUE_NAME,
      `Refresh collection metadata - add to queue. collectionId=${collectionId}, contract=${contract}, tokenId=${tokenId}, community=${community}`
    );
    await queue.add(randomUUID(), { collectionId, contract, tokenId, community }, { delay });
  }
};
