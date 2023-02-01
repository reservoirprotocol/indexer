/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, extendLock, releaseLock } from "@/common/redis";
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

      let count = 30; // Default number of tokens to fetch

      switch (method) {
        case "soundxyz":
          count = 10;
          break;

        case "simplehash":
          count = 50;
          break;
      }

      const countTotal = method === "opensea" ? config.maxParallelTokenRefreshJobs * count : count;

      // Get the tokens from the list
      const pendingRefreshTokens = new PendingRefreshTokens(method);
      const refreshTokens = await pendingRefreshTokens.get(countTotal);

      // If no more tokens
      if (_.isEmpty(refreshTokens)) {
        return;
      }

      logger.info(
        QUEUE_NAME,
        `Debug. method=${method}, count=${count}, countTotal=${countTotal}, refreshTokens=${refreshTokens.length}`
      );

      const tokensChunks = _.chunk(
        refreshTokens.map((refreshToken) => ({
          contract: refreshToken.contract,
          tokenId: refreshToken.tokenId,
        })),
        count
      );

      const metadata = [];

      const results = await Promise.allSettled(
        tokensChunks.map((tokensChunk) => MetadataApi.getTokensMetadata(tokensChunk, method))
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          metadata.push(result.value as any);
        } else {
          const error = result.reason as any;

          if (error.response?.status === 429) {
            logger.warn(
              QUEUE_NAME,
              `Too Many Requests. method=${method}, error=${JSON.stringify(error.response.data)}`
            );

            await pendingRefreshTokens.add(refreshTokens, true);
          } else {
            logger.error(
              QUEUE_NAME,
              `Error. method=${method}, error=${JSON.stringify(error.response.data)}`
            );
          }
        }
      }

      await metadataIndexWrite.addToQueue(
        metadata.map((m) => ({
          ...m,
        }))
      );

      // If there are potentially more tokens to process trigger another job
      if (_.size(refreshTokens) == countTotal) {
        if (await extendLock(getLockName(method), 60 * 30)) {
          await addToQueue(method);
        }
      } else {
        await releaseLock(getLockName(method));
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const getLockName = (method: string) => {
  return `${QUEUE_NAME}:${method}`;
};

export const addToQueue = async (method: string, delay = 0) => {
  await queue.add(randomUUID(), { method }, { delay });
};
