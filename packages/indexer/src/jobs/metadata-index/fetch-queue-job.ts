import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import _ from "lodash";
import { config } from "@/config/index";
import { redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { PendingRefreshTokens, RefreshTokens } from "@/models/pending-refresh-tokens";
import { PendingRefreshTokensBySlug } from "@/models/pending-refresh-tokens-by-slug";
import { acquireLock } from "@/common/redis";
import { AddressZero } from "@ethersproject/constants";
import { metadataProcessQueueJob } from "@/jobs/metadata-index/process-queue-job";
import { metadataProcessQueueBySlugJob } from "@/jobs/metadata-index/process-queue-by-slug-job";

export type MetadataFetchQueueJobPayload =
  | {
      kind: "full-collection";
      data: {
        method: string;
        collection: string;
        continuation?: string;
        prioritized?: boolean;
      };
    }
  | {
      kind: "full-collection-by-slug";
      data: {
        method: string;
        contract: string;
        collection: string;
        slug: string;
        prioritized?: boolean;
      };
    }
  | {
      kind: "single-token";
      data: {
        method: string;
        collection: string;
        contract: string;
        tokenId: string;
        prioritized?: boolean;
      };
    };

export class MetadataFetchQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "metadata-index-fetch-queue";
  maxRetries = 10;
  concurrency = 5;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: MetadataFetchQueueJobPayload) {
    // Do nothing if the indexer is running in liquidity-only mode
    if (config.liquidityOnly) {
      return;
    }

    const { kind, data } = payload;
    const prioritized = !_.isUndefined(payload.data.prioritized);
    const limit = 1000;
    let refreshTokens: RefreshTokens[] = [];

    if (kind === "full-collection-by-slug") {
      logger.info(this.queueName, `Full collection by slug. data=${JSON.stringify(data)}`);

      // Add the collections slugs to the list
      const pendingRefreshTokensBySlug = new PendingRefreshTokensBySlug();
      await pendingRefreshTokensBySlug.add(
        {
          slug: data.slug,
          contract: data.contract,
          collection: data.collection,
        },
        prioritized
      );

      if (await acquireLock(metadataProcessQueueBySlugJob.getLockName(data.method), 60 * 5)) {
        logger.info(
          this.queueName,
          `Full collection by slug - acquireLock. data=${JSON.stringify(data)}`
        );

        await metadataProcessQueueBySlugJob.addToQueue();
      }
      return;
    }
    if (kind === "full-collection") {
      logger.info(this.queueName, `Full collection. data=${JSON.stringify(data)}`);

      // Get batch of tokens for the collection
      const [contract, tokenId] = data.continuation
        ? data.continuation.split(":")
        : [AddressZero, "0"];
      refreshTokens = await this.getTokensForCollection(data.collection, contract, tokenId, limit);

      // If no more tokens found
      if (_.isEmpty(refreshTokens)) {
        logger.warn(this.queueName, `No more tokens found for collection: ${data.collection}`);
        return;
      }

      // If there are potentially more tokens to refresh
      if (_.size(refreshTokens) == limit) {
        const lastToken = refreshTokens[limit - 1];
        const continuation = `${lastToken.contract}:${lastToken.tokenId}`;
        logger.info(this.queueName, `Trigger token sync continuation: ${continuation}`);

        await this.addToQueue(
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
    await pendingRefreshTokens.add(refreshTokens, prioritized);

    if (await acquireLock(metadataProcessQueueJob.getLockName(data.method), 60 * 5)) {
      // Trigger a job to process the queue
      await metadataProcessQueueJob.addToQueue({ method: data.method });
    }
  }

  public async getTokensForCollection(
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

  public getIndexingMethod(community: string | null) {
    switch (community) {
      case "sound.xyz":
        return "soundxyz";
    }

    return config.metadataIndexingMethod;
  }

  public async addToQueue(
    metadataIndexInfos: MetadataFetchQueueJobPayload[],
    prioritized = false,
    delayInSeconds = 0
  ) {
    await this.sendBatch(
      metadataIndexInfos.map((info) => ({
        payload: { kind: info.kind, data: { ...info.data, prioritized } },
        delay: delayInSeconds * 1000,
        priority: prioritized ? 1 : 0,
      }))
    );
  }
}

export const metadataFetchQueueJob = new MetadataFetchQueueJob();
