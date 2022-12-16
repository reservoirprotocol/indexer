/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, extendLock, releaseLock, acquireLock, getLockExpiration } from "@/common/redis";
import { config } from "@/config/index";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";
import MetadataApi from "@/utils/metadata-api";

const QUEUE_NAME = "metadata-index-process-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "fixed",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
    timeout: 60 * 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { method } = job.data;

      let useMetadataApiBaseUrlAlt = false;

      const rateLimitExpiresIn = await getLockExpiration(getRateLimitLockName(method));

      if (rateLimitExpiresIn > 0) {
        logger.info(
          QUEUE_NAME,
          `Rate Limited. rateLimitExpiresIn=${rateLimitExpiresIn}, method=${method}`
        );

        useMetadataApiBaseUrlAlt = true;
      }

      if (config.chainId === 1 && method === "simplehash") {
        logger.info(QUEUE_NAME, `Forced alt. method=${method}`);

        useMetadataApiBaseUrlAlt = true;
      }

      let count = 20; // Default number of tokens to fetch
      switch (method) {
        case "soundxyz":
          count = 10;
          break;

        case "simplehash":
          count = 50;
          break;
      }

      // Get the tokens from the list
      const pendingRefreshTokens = new PendingRefreshTokens(method);
      const refreshTokens = await pendingRefreshTokens.get(count);
      const tokens = [];

      // If no more tokens
      if (_.isEmpty(refreshTokens)) {
        return;
      }

      // Build the query string for each token
      for (const refreshToken of refreshTokens) {
        tokens.push({
          contract: refreshToken.contract,
          tokenId: refreshToken.tokenId,
        });
      }

      let metadata;

      try {
        metadata = await MetadataApi.getTokensMetadata(tokens, useMetadataApiBaseUrlAlt, method);
      } catch (error) {
        if ((error as any).response?.status === 429) {
          logger.info(
            QUEUE_NAME,
            `Too Many Requests. useMetadataApiBaseUrlAlt=${useMetadataApiBaseUrlAlt}, method=${method}, error: ${JSON.stringify(
              (error as any).response.data
            )}`
          );

          await pendingRefreshTokens.add(refreshTokens, true);

          if (!useMetadataApiBaseUrlAlt) {
            await acquireLock(getRateLimitLockName(method), 5);

            if (await extendLock(getLockName(method), 60 * 5)) {
              await addToQueue(method);
            }
          } else {
            await releaseLock(getLockName(method));
          }

          return;
        }

        throw error;
      }

      await metadataIndexWrite.addToQueue(
        metadata.map((m) => ({
          ...m,
        }))
      );

      // If there are potentially more tokens to process trigger another job
      if (_.size(refreshTokens) == count) {
        if (await extendLock(getLockName(method), 60 * 5)) {
          await addToQueue(method);
        }
      } else {
        await releaseLock(getLockName(method));
      }
    },
    { connection: redis.duplicate(), concurrency: 2 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const getLockName = (method: string) => {
  return `${QUEUE_NAME}:${method}`;
};

export const getRateLimitLockName = (method: string) => {
  return `${QUEUE_NAME}:rate-limit:${method}`;
};

export const addToQueue = async (method: string, delay = 0) => {
  await queue.add(randomUUID(), { method }, { delay });
};
