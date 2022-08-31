/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Tokens } from "@/models/tokens";
import * as nonFlaggedTokenSet from "@/jobs/token-updates/non-flagged-token-set";
import MetadataApi from "@/utils/metadata-api";
import _ from "lodash";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";

const QUEUE_NAME = "sync-tokens-flag-status";
const LIMIT = 2;

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

      job.data.addToQueue = true;
      job.data.addToQueueDelay = 0;

      // Get the tokens from the list
      const pendingFlagStatusSyncTokensQueue = new PendingFlagStatusSyncTokens(collectionId);
      const pendingSyncFlagStatusTokens = await pendingFlagStatusSyncTokensQueue.get(LIMIT);

      if (_.isEmpty(pendingSyncFlagStatusTokens)) {
        logger.info(QUEUE_NAME, `Recalc TokenSet. contract:${contract}`);

        job.data.addToQueue = false;
        await nonFlaggedTokenSet.addToQueue(contract, collectionId);

        return;
      }

      await Promise.all(
        pendingSyncFlagStatusTokens.map(async (pendingSyncFlagStatusToken) => {
          try {
            const isFlagged = await MetadataApi.getTokenFlagStatus(
              contract,
              pendingSyncFlagStatusToken.tokenId
            );

            logger.info(
              QUEUE_NAME,
              `Flag Status. contract:${contract}, tokenId: ${
                pendingSyncFlagStatusToken.tokenId
              }, tokenIsFlagged:${
                pendingSyncFlagStatusToken.isFlagged
              }, isFlagged:${isFlagged}, flagStatusDiff=${
                pendingSyncFlagStatusToken.isFlagged != isFlagged
              }`
            );

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

              job.data.addToQueueDelay = 5000;

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
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue(job.data.collectionId, job.data.contract, job.data.addToQueueDelay);
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (collectionId: string, contract: string, delay = 0) => {
  const jobId = `${collectionId}:${contract}`;
  await queue.add(jobId, { collectionId, contract }, { jobId, delay });
};
