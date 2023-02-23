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

      let count = 20; // Default number of tokens to fetch

      switch (method) {
        case "soundxyz":
          count = 10;
          break;

        case "simplehash":
          count = 50;
          break;
      }

      const countTotal = method !== "soundxyz" ? config.maxParallelTokenRefreshJobs * count : count;

      // Get the tokens from the list
      const pendingRefreshTokens = new PendingRefreshTokens(method);
      const refreshTokens = await pendingRefreshTokens.get(countTotal);

      // If no more tokens
      if (_.isEmpty(refreshTokens)) {
        await releaseLock(getLockName(method));
        return;
      }

      const refreshTokensChunks = _.chunk(refreshTokens, count);

      let rateLimitExpiredIn = 0;

      const results = await Promise.all(
        refreshTokensChunks.map((refreshTokensChunk) =>
          MetadataApi.getTokensMetadata(
            refreshTokensChunk.map((refreshToken) => ({
              contract: refreshToken.contract,
              tokenId: refreshToken.tokenId,
            })),
            method
          ).catch(async (error) => {
            if (error.response?.status === 429) {
              logger.warn(
                QUEUE_NAME,
                `Too Many Requests. method=${method}, error=${JSON.stringify(error.response.data)}`
              );

              rateLimitExpiredIn = Math.max(rateLimitExpiredIn, error.response.data.expires_in, 5);

              await pendingRefreshTokens.add(refreshTokensChunk, true);
            } else {
              logger.error(
                QUEUE_NAME,
                `Error. method=${method}, status=${error.response?.status}, error=${JSON.stringify(
                  error.response.data
                )}, refreshTokensChunk=${JSON.stringify(refreshTokensChunk)}`
              );

              if (error.response?.data.error === "Request failed with status code 403") {
                await pendingRefreshTokens.add(refreshTokensChunk, true);
              }
            }

            return [];
          })
        )
      );

      const metadata = results.flat(1);

      logger.info(
        QUEUE_NAME,
        `Debug. method=${method}, count=${count}, countTotal=${countTotal}, refreshTokens=${refreshTokens.length}, refreshTokensChunks=${refreshTokensChunks.length}, metadata=${metadata.length}, rateLimitExpiredIn=${rateLimitExpiredIn}`
      );

      await metadataIndexWrite.addToQueue(
        metadata.map((m) => ({
          ...m,
        }))
      );

      // If there are potentially more tokens to process trigger another job
      if (rateLimitExpiredIn || _.size(refreshTokens) == countTotal) {
        if (await extendLock(getLockName(method), 60 * 5 + rateLimitExpiredIn)) {
          await addToQueue(method, rateLimitExpiredIn * 1000);
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
