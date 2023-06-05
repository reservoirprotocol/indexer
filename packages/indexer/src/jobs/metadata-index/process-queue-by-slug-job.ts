/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import _ from "lodash";
import { extendLock, releaseLock } from "@/common/redis";
import MetadataApi from "@/utils/metadata-api";
import {
  PendingRefreshTokensBySlug,
  RefreshTokenBySlug,
} from "@/models/pending-refresh-tokens-by-slug";
import { metadataFetchQueueJob } from "@/jobs/metadata-index/fetch-queue-job";
import { Tokens } from "@/models/tokens";
import { metadataQueueJob } from "@/jobs/collection-updates/metadata-queue-job";
import { metadataWriteQueueJob } from "@/jobs/metadata-index/write-queue-job";

export type MetadataProcessQueueBySlugJobPayload = {
  addToQueue?: boolean;
  addToQueueDelay?: number;
};

export class MetadataProcessQueueBySlugJob extends AbstractRabbitMqJobHandler {
  queueName = "metadata-index-process-queue-by-slug";
  maxRetries = 10;
  concurrency = 1;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;

  protected async process(payload: MetadataProcessQueueBySlugJobPayload) {
    const method = "opensea";
    const count = 1; // Default number of tokens to fetch
    let retry = false;
    payload.addToQueue = false;

    const countTotal = config.maxParallelTokenCollectionSlugRefreshJobs * count;

    // Get the collection slugs from the list
    const pendingRefreshTokensBySlug = new PendingRefreshTokensBySlug();
    const refreshTokensBySlug = await pendingRefreshTokensBySlug.get(countTotal);

    // If no more collection slugs, release lock
    if (_.isEmpty(refreshTokensBySlug)) {
      await releaseLock(this.getLockName(method));

      return;
    }
    let rateLimitExpiredIn = 0;
    const metadata: any[] = [];

    async function processSlug(refreshTokenBySlug: RefreshTokenBySlug) {
      try {
        const results = await MetadataApi.getTokensMetadataBySlug(
          refreshTokenBySlug.contract,
          refreshTokenBySlug.slug,
          method,
          refreshTokenBySlug.continuation
        );
        if (results.metadata.length === 0) {
          //  Slug might be missing or might be wrong.
          await metadataProcessQueueBySlugJob.addToTokenRefreshQueueAndUpdateCollectionMetadata(
            method,
            refreshTokenBySlug
          );
          return;
        }
        if (results.continuation) {
          retry = true;
          await pendingRefreshTokensBySlug.add(
            {
              slug: refreshTokenBySlug.slug,
              contract: refreshTokenBySlug.contract,
              collection: refreshTokenBySlug.collection,
              continuation: results.continuation,
            },
            true
          );
        }
        metadata.push(...results.metadata);
      } catch (error: any) {
        if (error.response?.status === 429) {
          logger.warn(
            metadataProcessQueueBySlugJob.queueName,
            `Too Many Requests. method=${method}, error=${JSON.stringify(error.response.data)}`
          );

          rateLimitExpiredIn = Math.max(rateLimitExpiredIn, error.response.data.expires_in, 5);

          await pendingRefreshTokensBySlug.add(refreshTokenBySlug, true);
        } else {
          logger.error(
            metadataProcessQueueBySlugJob.queueName,
            `Error. method=${method}, refreshTokenBySlug=${JSON.stringify(
              refreshTokenBySlug
            )}, error=${JSON.stringify(error.response.data)}`
          );
          await metadataFetchQueueJob.addToQueue(
            [
              {
                kind: "full-collection",
                data: {
                  method,
                  collection: refreshTokenBySlug.contract,
                },
              },
            ],
            true
          );
        }
      }
    }

    await Promise.all(
      refreshTokensBySlug.map((refreshTokenBySlug) => {
        return processSlug(refreshTokenBySlug);
      })
    );

    await metadataWriteQueueJob.addToQueue(
      metadata.map((m) => ({
        ...m,
      }))
    );

    // If there are potentially more tokens to process trigger another job
    if (rateLimitExpiredIn || _.size(refreshTokensBySlug) == countTotal || retry) {
      if (await extendLock(this.getLockName(method), 60 * 5 + rateLimitExpiredIn)) {
        payload.addToQueue = true;
        payload.addToQueueDelay = rateLimitExpiredIn * 1000;
      }
    } else {
      await releaseLock(this.getLockName(method));
    }
  }

  public async addToTokenRefreshQueueAndUpdateCollectionMetadata(
    method: string,
    refreshTokenBySlug: RefreshTokenBySlug
  ) {
    logger.info(
      this.queueName,
      `Fallback. method=${method}, refreshTokenBySlug=${JSON.stringify(refreshTokenBySlug)}`
    );

    const tokenId = await Tokens.getSingleToken(refreshTokenBySlug.collection);
    await Promise.all([
      metadataFetchQueueJob.addToQueue(
        [
          {
            kind: "full-collection",
            data: {
              method,
              collection: refreshTokenBySlug.collection,
            },
          },
        ],
        true
      ),
      metadataQueueJob.addToQueue({ contract: refreshTokenBySlug.contract, tokenId }, 0),
    ]);
  }

  public getLockName(method: string) {
    return `${this.queueName}:${method}`;
  }

  public async addToQueue(delay = 0) {
    await this.send({}, delay);
  }
}

export const metadataProcessQueueBySlugJob = new MetadataProcessQueueBySlugJob();

metadataProcessQueueBySlugJob.on("onCompleted", async (message) => {
  if (message.payload.addToQueue) {
    await metadataProcessQueueBySlugJob.addToQueue(message.payload.addToQueueDelay);
  }
});
