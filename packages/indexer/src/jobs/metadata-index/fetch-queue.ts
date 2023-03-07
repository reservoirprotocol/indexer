import { AddressZero } from "@ethersproject/constants";
import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, acquireLock } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { PendingRefreshTokens, RefreshTokens } from "@/models/pending-refresh-tokens";
import * as metadataIndexProcess from "@/jobs/metadata-index/process-queue";
import * as metadataIndexProcessBySlug from "@/jobs/metadata-index/process-queue-by-slug";
import { PendingRefreshTokensBySlug } from "@/models/pending-refresh-tokens-by-slug";

export const QUEUE_NAME = "metadata-index-fetch-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
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
      // Do nothing if the indexer is running in liquidity-only mode
      if (config.liquidityOnly) {
        return;
      }

      const { kind, data } = job.data as MetadataIndexInfo;
      const prioritized = !_.isUndefined(job.opts.priority);
      const limit = 1000;
      let refreshTokens: RefreshTokens[] = [];

      if (kind === "full-collection-by-slug") {
        // Add the collections slugs to the list
        const pendingRefreshTokensBySlug = new PendingRefreshTokensBySlug();
        const pendingCount = await pendingRefreshTokensBySlug.add(
          {
            slug: data.slug,
            contract: data.contract,
            collection: data.collection,
          },
          prioritized
        );

        logger.debug(
          QUEUE_NAME,
          `There are ${pendingCount} collections slugs pending to refresh for ${data.method}`
        );
        if (await acquireLock(metadataIndexProcessBySlug.getLockName(data.method), 60 * 5)) {
          await metadataIndexProcessBySlug.addToQueue();
        }
        return;
      }
      if (kind === "full-collection") {
        // Get batch of tokens for the collection
        const [contract, tokenId] = data.continuation
          ? data.continuation.split(":")
          : [AddressZero, "0"];
        refreshTokens = await getTokensForCollection(data.collection, contract, tokenId, limit);

        // If no more tokens found
        if (_.isEmpty(refreshTokens)) {
          logger.warn(QUEUE_NAME, `No more tokens found for collection: ${data.collection}`);
          return;
        }

        // If there are potentially more tokens to refresh
        if (_.size(refreshTokens) == limit) {
          const lastToken = refreshTokens[limit - 1];
          const continuation = `${lastToken.contract}:${lastToken.tokenId}`;
          logger.info(QUEUE_NAME, `Trigger token sync continuation: ${continuation}`);

          await addToQueue(
            [
              {
                kind,
                data: {
                  ...data,
                  continuation,
                },
              },
            ],
            prioritized
          );
        }
      } else if (kind === "single-token") {
        // Create the single token from the params
        refreshTokens.push({
          collection: data.collection,
          contract: data.contract,
          tokenId: data.tokenId,
        });
      }

      // Add the tokens to the list
      const pendingRefreshTokens = new PendingRefreshTokens(data.method);
      const pendingCount = await pendingRefreshTokens.add(refreshTokens, prioritized);

      logger.debug(
        QUEUE_NAME,
        `There are ${pendingCount} collection slugs pending to refresh for ${data.method}`
      );

      if (await acquireLock(metadataIndexProcess.getLockName(data.method), 60 * 5)) {
        // Trigger a job to process the queue
        await metadataIndexProcess.addToQueue(data.method);
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

async function getTokensForCollection(
  collection: string,
  contract: string,
  tokenId: string,
  limit: number
) {
  const tokens = await redb.manyOrNone(
    `SELECT tokens.contract, tokens.token_id
            FROM tokens
            WHERE tokens.collection_id = $/collection/
            AND (tokens.contract, tokens.token_id) > ($/contract/, $/tokenId/)
            LIMIT ${limit}`,
    {
      collection: collection,
      contract: toBuffer(contract),
      tokenId: tokenId,
    }
  );

  return tokens.map((t) => {
    return { collection, contract: fromBuffer(t.contract), tokenId: t.token_id } as RefreshTokens;
  });
}

export function getIndexingMethod(community: string | null) {
  switch (community) {
    case "sound.xyz":
      return "soundxyz";
  }

  return config.metadataIndexingMethod;
}

export type MetadataIndexInfo =
  | {
      kind: "full-collection";
      data: {
        method: string;
        collection: string;
        continuation?: string;
      };
    }
  | {
      kind: "full-collection-by-slug";
      data: {
        method: string;
        contract: string;
        collection: string;
        slug: string;
      };
    }
  | {
      kind: "single-token";
      data: {
        method: string;
        collection: string;
        contract: string;
        tokenId: string;
      };
    };

export const addToQueue = async (
  metadataIndexInfos: MetadataIndexInfo[],
  prioritized = false,
  delayInSeconds = 0
) => {
  if (config.chainId === 137) {
    metadataIndexInfos = _.filter(
      metadataIndexInfos,
      (data) => data.data.collection !== "0x4923917e9e288b95405e2c893d0ac46b895dda22"
    );
  }

  await queue.addBulk(
    metadataIndexInfos.map((metadataIndexInfo) => ({
      name: randomUUID(),
      data: metadataIndexInfo,
      opts: {
        priority: prioritized ? 1 : undefined,
        delay: delayInSeconds * 1000,
      },
    }))
  );
};
