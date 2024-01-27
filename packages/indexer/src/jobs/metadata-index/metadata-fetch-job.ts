import { redb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { config } from "@/config/index";
import { PendingRefreshTokens, RefreshTokens } from "@/models/pending-refresh-tokens";
import { logger } from "@/common/logger";
import { AddressZero } from "@ethersproject/constants";
import { metadataIndexProcessJob } from "@/jobs/metadata-index/metadata-process-job";
import { onchainMetadataFetchTokenUriJob } from "@/jobs/metadata-index/onchain-metadata-fetch-token-uri-job";
import { isOpenseaSlugSharedContract } from "@/metadata/extend";

export type MetadataIndexFetchJobPayload =
  | {
      kind: "full-collection";
      data: {
        method: string;
        collection: string;
        continuation?: string;
      };
      context?: string;
    }
  | {
      kind: "single-token";
      data: {
        method: string;
        collection: string;
        contract: string;
        tokenId: string;
      };
      context?: string;
    };

export default class MetadataIndexFetchJob extends AbstractRabbitMqJobHandler {
  queueName = "metadata-index-fetch-queue";
  maxRetries = 10;
  concurrency = 5;
  lazyMode = true;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: MetadataIndexFetchJobPayload) {
    // Do nothing if the indexer is running in liquidity-only mode
    if (config.liquidityOnly) {
      return;
    }

    const { kind, data } = payload;
    const prioritized = !_.isUndefined(this.rabbitMqMessage?.prioritized);
    const limit = 1000;
    let refreshTokens: RefreshTokens[] = [];

    if (
      [
        "0x23581767a106ae21c074b2276d25e5c3e136a68b",
        "0x4481507cc228fa19d203bd42110d679571f7912e",
        // "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
      ].includes(payload.data.collection)
    ) {
      data.method = "simplehash";
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
      if (isOpenseaSlugSharedContract(payload.data.contract)) {
        data.method = "simplehash";
      }

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

    if (data.method === "onchain") {
      await onchainMetadataFetchTokenUriJob.addToQueue();
    } else {
      await metadataIndexProcessJob.addToQueue({ method: data.method });
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

  public getIndexingMethod(community?: string | null) {
    switch (community) {
      case "sound.xyz":
        return "soundxyz";
    }

    return config.metadataIndexingMethod;
  }

  public async addToQueue(
    metadataIndexInfos: MetadataIndexFetchJobPayload[],
    prioritized = false,
    delayInSeconds = 0
  ) {
    await this.sendBatch(
      metadataIndexInfos.map((metadataIndexInfo) => ({
        payload: metadataIndexInfo,
        delay: delayInSeconds * 1000,
        priority: prioritized ? 1 : 0,
      }))
    );
  }
}

export const metadataIndexFetchJob = new MetadataIndexFetchJob();
