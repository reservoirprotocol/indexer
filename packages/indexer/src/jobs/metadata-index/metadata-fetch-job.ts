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
import { redis } from "@/common/redis";

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
  timeout = 60000;
  priorityQueue = true;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: MetadataIndexFetchJobPayload) {
    // Do nothing if the indexer is running in liquidity-only mode
    if (config.liquidityOnly) {
      return;
    }

    const debugMissingTokenImages = await redis.sismember(
      "missing-token-image-contracts",
      payload.data.collection
    );

    if (debugMissingTokenImages) {
      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "debugMissingTokenImages",
          message: `Start. collection=${payload.data.collection}, tokenId=${
            payload.kind === "single-token" ? payload.data.tokenId : ""
          }`,
          payload,
        })
      );
    }

    const { kind, data } = payload;
    const prioritized = !_.isUndefined(this.rabbitMqMessage?.prioritized);
    const limit = 1000;
    let refreshTokens: RefreshTokens[] = [];

    if (
      [
        "0x23581767a106ae21c074b2276d25e5c3e136a68b",
        "0x4481507cc228fa19d203bd42110d679571f7912e",
        "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        "0x4b15a9c28034dc83db40cd810001427d3bd7163d",
        "0xa28d6a8eb65a41f3958f1de62cbfca20b817e66a",
        // "0xb660c6dc8b18e7541a493a9014d0525575184bd7",
        "0x9e9fbde7c7a83c43913bddc8779158f1368f0413",
        "0xba5e05cb26b78eda3a2f8e3b3814726305dcac83",
      ].includes(payload.data.collection)
    ) {
      data.method = "simplehash";
    }

    if (kind === "full-collection") {
      logger.info(
        this.queueName,
        JSON.stringify({
          message: `Full collection. collection=${payload.data.collection}`,
          data,
          prioritized,
        })
      );

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

        logger.info(
          this.queueName,
          JSON.stringify({
            message: `Trigger token sync continuation. collection=${payload.data.collection}, continuation=${continuation}`,
            data,
            prioritized,
          })
        );

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
        priority: prioritized ? 0 : 0,
      }))
    );
  }
}

export const metadataIndexFetchJob = new MetadataIndexFetchJob();
