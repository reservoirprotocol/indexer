/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { logger } from "@/common/logger";
import { redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";

import { Tokens } from "@/models/tokens";
import * as flagStatusGenerateCollectionTokenSet from "@/jobs/flag-status/generate-collection-token-set";
import MetadataApi from "@/utils/metadata-api";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import * as flagStatusProcessQueue from "@/jobs/flag-status/process-queue";
import { randomUUID } from "crypto";
import _ from "lodash";

const QUEUE_NAME = "flag-status-sync-queue";
const LIMIT = 40;

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
      const { collectionId, contract } = job.data;

      let delay = 2500;

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

      const pendingSyncFlagStatusTokensChunks = _.chunk(pendingSyncFlagStatusTokens, 20);

      await Promise.all(
        pendingSyncFlagStatusTokensChunks.map(async (pendingSyncFlagStatusTokensChunk) => {
          try {
            const tokensMetadata = await MetadataApi.getTokensMetadata(
              pendingSyncFlagStatusTokensChunk,
              true
            );

            for (const pendingSyncFlagStatusToken of pendingSyncFlagStatusTokensChunk) {
              const tokenMetadata = tokensMetadata.find(
                (tokenMetadata) => tokenMetadata.tokenId === pendingSyncFlagStatusToken.tokenId
              );

              if (!tokenMetadata) {
                logger.warn(
                  QUEUE_NAME,
                  `Missing Token Metadata. contract:${contract}, tokenId: ${pendingSyncFlagStatusToken.tokenId}, tokenIsFlagged:${pendingSyncFlagStatusToken.isFlagged}`
                );

                continue;
              }

              const isFlagged = Number(tokenMetadata.flagged);

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
            }
          } catch (error) {
            if ((error as any).response?.status === 429) {
              logger.info(
                QUEUE_NAME,
                `Too Many Requests. error: ${JSON.stringify((error as any).response.data)}`
              );

              delay = 60 * 1000;

              await pendingFlagStatusSyncTokensQueue.add(pendingSyncFlagStatusTokensChunk);
            } else {
              logger.error(
                QUEUE_NAME,
                `getTokenMetadata error. contract:${contract}, error:${error}`
              );
            }
          }
        })
      );

      await addToQueue(collectionId, contract, delay);
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
