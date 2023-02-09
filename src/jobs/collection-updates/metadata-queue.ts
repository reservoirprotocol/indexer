import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { logger } from "@/common/logger";
import { redis, acquireLock } from "@/common/redis";
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
      const { contract, tokenId, community } = job.data;

      logger.info(
        QUEUE_NAME,
        `Refresh collection metadata start. contract=${contract}, tokenId=${tokenId}, community=${community}`
      );

      if (await acquireLock(QUEUE_NAME, 1)) {
        logger.info(
          QUEUE_NAME,
          `Refresh collection metadata - got lock. contract=${contract}, tokenId=${tokenId}, community=${community}`
        );

        // Lock this contract for the next 5 minutes
        await acquireLock(`${QUEUE_NAME}:${contract}`, 5 * 60);

        try {
          await Collections.updateCollectionCache(contract, tokenId, community);
        } catch (error) {
          logger.error(
            QUEUE_NAME,
            `Failed to update collection metadata. contract=${contract}, tokenId=${tokenId}, community=${community}, error=${error}`
          );
        }
      } else {
        logger.info(
          QUEUE_NAME,
          `Refresh collection metadata - delayed. contract=${contract}, tokenId=${tokenId}, community=${community}`
        );

        job.data.addToQueue = true;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job: Job) => {
    if (job.data.addToQueue) {
      const { contract, tokenId, community } = job.data;
      await addToQueue(contract, tokenId, community, 1000);
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
};

export const addToQueueBulk = async (
  collectionMetadataInfos: CollectionMetadataInfo[],
  delay = 0
) => {
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
  forceRefresh = false
) => {
  if (_.isArray(contract)) {
    await queue.addBulk(
      _.map(contract, (c) => ({
        name: randomUUID(),
        data: { contract: c.contract, tokenId, community: c.community },
        opts: { delay },
      }))
    );
  } else {
    if (forceRefresh || _.isNull(await redis.get(`${QUEUE_NAME}:${contract}`))) {
      logger.info(
        QUEUE_NAME,
        `Refresh collection metadata - add to queue. contract=${contract}, tokenId=${tokenId}, community=${community}`
      );
      await queue.add(randomUUID(), { contract, tokenId, community }, { delay });
    }
  }
};
