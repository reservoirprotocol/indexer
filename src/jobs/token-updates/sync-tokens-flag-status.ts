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

      job.data.addToQueue = false;
      job.data.addToQueueDelay = 1000;

      // Get the tokens from the list
      const pendingFlagStatusSyncTokensQueue = new PendingFlagStatusSyncTokens(collectionId);
      const pendingSyncFlagStatusTokens = await pendingFlagStatusSyncTokensQueue.get(LIMIT);

      if (_.isEmpty(pendingSyncFlagStatusTokens)) {
        logger.info(QUEUE_NAME, `No pending tokens. contract:${contract}`);
        return;
      }

      for (const pendingSyncFlagStatusToken of pendingSyncFlagStatusTokens) {
        try {
          const metadata = await MetadataApi.getTokenMetadata(
            [{ contract, tokenId: pendingSyncFlagStatusToken.tokenId }],
            true
          );

          const metadataIsFlagged = Number(metadata[0].flagged);
          const flagStatusDiff = pendingSyncFlagStatusToken.isFlagged != metadataIsFlagged;

          logger.info(
            QUEUE_NAME,
            `Flag Status. contract:${contract}, tokenId: ${pendingSyncFlagStatusToken.tokenId}, isFlagged:${pendingSyncFlagStatusToken.isFlagged}, metadataIsFlagged:${metadataIsFlagged}, flagStatusDiff=${flagStatusDiff}`
          );

          await Tokens.update(contract, pendingSyncFlagStatusToken.tokenId, {
            isFlagged: metadataIsFlagged,
            lastFlagUpdate: new Date().toISOString(),
          });
        } catch (error) {
          if ((error as any).response?.status === 429) {
            logger.info(
              QUEUE_NAME,
              `Too Many Requests. error: ${JSON.stringify((error as any).response.data)}`
            );

            job.data.addToQueueDelay = 5000;

            await pendingFlagStatusSyncTokensQueue.add([pendingSyncFlagStatusToken], true);
          } else {
            logger.error(
              QUEUE_NAME,
              `getTokenMetadata error. contract:${contract}, tokenId: ${pendingSyncFlagStatusToken.tokenId}, error:${error}`
            );
          }
        }
      }

      if (_.size(pendingSyncFlagStatusTokens) == LIMIT) {
        job.data.addToQueue = true;
      } else {
        logger.info(QUEUE_NAME, `Recalc TokenSet. contract:${contract}`);
        await nonFlaggedTokenSet.addToQueue(contract, collectionId);
      }
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
