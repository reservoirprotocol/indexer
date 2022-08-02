/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";
import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, extendLock, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";

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
  type TokenMetadata = {
    contract: string;
    tokenId: string;
    name?: string;
    description?: string;
    imageUrl?: string;
    mediaUrl?: string;
    attributes: {
      key: string;
      value: string;
      kind: "string" | "number" | "date" | "range";
      rank?: number;
    }[];
  };

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { method } = job.data;

      const count = 20;

      const queryParams = new URLSearchParams();
      queryParams.append("method", method);

      // Get the tokens from the list
      const pendingRefreshTokens = new PendingRefreshTokens(method);
      const refreshTokens = await pendingRefreshTokens.get(count);
      const tokenToCollections = {};

      // If no more tokens
      if (_.isEmpty(refreshTokens)) {
        return;
      }

      // Build the query string and store the collection for each token
      for (const refreshToken of refreshTokens) {
        queryParams.append("token", `${refreshToken.contract}:${refreshToken.tokenId}`);
        (tokenToCollections as any)[`${refreshToken.contract}:${refreshToken.tokenId}`] =
          refreshToken.collection;
      }

      // Get the metadata for the tokens
      const url = `${
        config.metadataApiBaseUrl
      }/v4/${getNetworkName()}/metadata/token?${queryParams.toString()}`;

      let metadataResult;

      try {
        metadataResult = await axios.get(url, { timeout: 60 * 1000 }).then(({ data }) => data);
      } catch (error) {
        if ((error as any).response?.status === 429) {
          logger.info(
            QUEUE_NAME,
            `Too Many Requests. error: ${JSON.stringify((error as any).response.data)}`
          );

          const delay = (error as any).response.data.expires_in;

          // Put tokens back in the list
          await pendingRefreshTokens.add(refreshTokens, true);

          // Trigger another job
          if (await extendLock(getLockName(method), delay + 60 * 5)) {
            await addToQueue(method, delay * 1000);
          }

          return;
        }

        throw error;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const metadata: TokenMetadata[] = (metadataResult as any).metadata;

      await metadataIndexWrite.addToQueue(
        metadata.map((m) => ({
          ...m,
          collection: (tokenToCollections as any)[`${m.contract.toLowerCase()}:${m.tokenId}`],
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

export const addToQueue = async (method: string, delay = 0) => {
  await queue.add(randomUUID(), { method }, { delay });
};
