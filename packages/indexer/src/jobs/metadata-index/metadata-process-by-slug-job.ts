/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { metadataIndexWriteJob } from "@/jobs/metadata-index/metadata-write-job";
import {
  PendingRefreshTokensBySlug,
  RefreshTokenBySlug,
} from "@/models/pending-refresh-tokens-by-slug";
import { Tokens } from "@/models/tokens";
import { Collections } from "@/models/collections";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { collectionMetadataQueueJob } from "@/jobs/collection-updates/collection-metadata-queue-job";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { openseaMetadataProvider } from "@/metadata/providers/opensea-metadata-provider";

export type MetadataIndexProcessBySlugJobPayload = {
  method: string;
};

export default class MetadataIndexProcessBySlugJob extends AbstractRabbitMqJobHandler {
  queueName = "metadata-index-process-queue-by-slug";
  maxRetries = 10;
  concurrency = 1;
  singleActiveConsumer = true;
  lazyMode = true;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;

  public async process(payload: MetadataIndexProcessBySlugJobPayload) {
    const { method } = payload;
    const count = 1; // Default number of tokens to fetch
    let retry = false;

    const countTotal = config.maxParallelTokenCollectionSlugRefreshJobs * count;

    // Get the collection slugs from the list
    const pendingRefreshTokensBySlug = new PendingRefreshTokensBySlug();
    const refreshTokensBySlug = await pendingRefreshTokensBySlug.get(countTotal);

    // If no more collection slugs, release lock
    if (_.isEmpty(refreshTokensBySlug)) {
      return;
    }
    let rateLimitExpiredIn = 0;
    const metadata: any[] = [];

    async function processSlug(refreshTokenBySlug: RefreshTokenBySlug) {
      try {
        const results = await openseaMetadataProvider.getTokensMetadataBySlug(
          refreshTokenBySlug.slug,
          refreshTokenBySlug.continuation ?? ""
        );
        if (results.metadata.length === 0) {
          //  Slug might be missing or might be wrong.
          await metadataIndexProcessBySlugJob.addToTokenRefreshQueueAndUpdateCollectionMetadata(
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
            metadataIndexProcessBySlugJob.queueName,
            `Too Many Requests. method=${method}, error=${JSON.stringify(error.response.data)}`
          );

          rateLimitExpiredIn = Math.max(rateLimitExpiredIn, error.response.data.expires_in, 5);

          await pendingRefreshTokensBySlug.add(refreshTokenBySlug, true);
        } else {
          logger.error(
            metadataIndexProcessBySlugJob.queueName,
            `Error. method=${method}, refreshTokenBySlug=${JSON.stringify(
              refreshTokenBySlug
            )}, error=${JSON.stringify(error.response.data)}`
          );
          await metadataIndexFetchJob.addToQueue(
            [
              {
                kind: "full-collection",
                data: {
                  method,
                  collection: refreshTokenBySlug.contract,
                },
                context: "processSlug",
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

    logger.info(
      this.queueName,
      `Debug. method=${method}, refreshTokensBySlug=${JSON.stringify(
        refreshTokensBySlug
      )}, metadata=${metadata.length}, rateLimitExpiredIn=${rateLimitExpiredIn}`
    );

    await metadataIndexWriteJob.addToQueue(
      metadata.map((m) => ({
        ...m,
        metadataMethod: method,
      }))
    );

    // If there are potentially more tokens to process trigger another job
    if (rateLimitExpiredIn || _.size(refreshTokensBySlug) == countTotal || retry) {
      return rateLimitExpiredIn || 1;
    }

    return 0;
  }

  public async addToTokenRefreshQueueAndUpdateCollectionMetadata(
    refreshTokenBySlug: RefreshTokenBySlug
  ) {
    logger.info(
      this.queueName,
      `Fallback. refreshTokenBySlug=${JSON.stringify(refreshTokenBySlug)}`
    );

    const tokenId = await Tokens.getSingleToken(refreshTokenBySlug.collection);
    const collection = await Collections.getById(refreshTokenBySlug.collection);

    if (collection) {
      const method = metadataIndexFetchJob.getIndexingMethod(collection.community);

      await Promise.all([
        metadataIndexFetchJob.addToQueue(
          [
            {
              kind: "full-collection",
              data: {
                method,
                collection: refreshTokenBySlug.collection,
              },
              context: this.queueName,
            },
          ],
          true
        ),
        collectionMetadataQueueJob.addToQueue({
          contract: refreshTokenBySlug.contract,
          tokenId,
          community: collection.community,
          forceRefresh: false,
        }),
      ]);
    }
  }

  public async onCompleted(rabbitMqMessage: RabbitMQMessage, processResult: undefined | number) {
    if (processResult) {
      const { method } = rabbitMqMessage.payload;
      await this.addToQueue({ method }, processResult * 1000);
    }
  }

  public async addToQueue(
    params: MetadataIndexProcessBySlugJobPayload = { method: "opensea" },
    delay = 0
  ) {
    await this.send({ payload: params, jobId: params.method }, delay);
  }
}

export const metadataIndexProcessBySlugJob = new MetadataIndexProcessBySlugJob();
