/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { logger } from "@/common/logger";
import { extendLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";

import { Tokens } from "@/models/tokens";
import * as flagStatusGenerateCollectionTokenSet from "@/jobs/flag-status/generate-collection-token-set";
import MetadataApi from "@/utils/metadata-api";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import * as flagStatusProcessQueue from "@/jobs/flag-status/process-queue";
import { randomUUID } from "crypto";

const QUEUE_NAME = "flag-status-sync-queue";
const LIMIT = 4;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: true,
    removeOnFail: true,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { collectionId, contract } = job.data;

      let delay = 5000;

      // Get the tokens from the list
      const pendingFlagStatusSyncTokensQueue = new PendingFlagStatusSyncTokens(collectionId);
      const pendingSyncFlagStatusTokens = await pendingFlagStatusSyncTokensQueue.get(LIMIT);

      if (pendingSyncFlagStatusTokens.length == 0) {
        logger.info(
          QUEUE_NAME,
          `Sync completed. collectionId:${collectionId}, contract:${contract}`
        );

        await releaseLock(getLockName());

        await flagStatusProcessQueue.addToQueue();
        await flagStatusGenerateCollectionTokenSet.addToQueue(contract, collectionId);

        return;
      }

      await Promise.all(
        pendingSyncFlagStatusTokens.map(async (pendingSyncFlagStatusToken) => {
          try {
            const isFlagged = await MetadataApi.getTokenFlagStatus(
              contract,
              pendingSyncFlagStatusToken.tokenId
            );

            if (pendingSyncFlagStatusToken.isFlagged != isFlagged) {
              logger.info(
                QUEUE_NAME,
                `Flag Status Diff. contract:${contract}, tokenId: ${pendingSyncFlagStatusToken.tokenId}, tokenIsFlagged:${pendingSyncFlagStatusToken.isFlagged}, isFlagged:${isFlagged}`
              );
            }

            await Tokens.update(contract, pendingSyncFlagStatusToken.tokenId, {
              isFlagged,
              lastFlagUpdate: new Date().toISOString(),
            });
          } catch (error) {
            if ((error as any).response?.status === 429) {
              logger.info(
                QUEUE_NAME,
                `Too Many Requests. error: ${JSON.stringify((error as any).response.data)}`
              );

              delay = 60 * 1000;

              await pendingFlagStatusSyncTokensQueue.add([pendingSyncFlagStatusToken]);
            } else {
              logger.error(
                QUEUE_NAME,
                `getTokenMetadata error. contract:${contract}, tokenId: ${pendingSyncFlagStatusToken.tokenId}, error:${error}`
              );
            }
          }
        })
      );

      if (await extendLock(getLockName(), 60 * 5)) {
        await addToQueue(collectionId, contract, delay);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const getLockName = () => {
  return `${QUEUE_NAME}-lock`;
};

export const addToQueue = async (collectionId: string, contract: string, delay = 0) => {
  await queue.add(randomUUID(), { collectionId, contract }, { delay });
};
