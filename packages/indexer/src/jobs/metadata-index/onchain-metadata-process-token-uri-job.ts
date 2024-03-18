/* eslint-disable @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { config } from "@/config/index";

import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { metadataIndexWriteJob } from "@/jobs/metadata-index/metadata-write-job";
import { onchainMetadataProvider } from "@/metadata/providers/onchain-metadata-provider";
import {
  RequestWasThrottledError,
  TokenUriNotFoundError,
  TokenUriRequestForbiddenError,
  TokenUriRequestTimeoutError,
} from "@/metadata/providers/utils";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { redis } from "@/common/redis";

export type OnchainMetadataProcessTokenUriJobPayload = {
  contract: string;
  tokenId: string;
  uri: string;
};

export default class OnchainMetadataProcessTokenUriJob extends AbstractRabbitMqJobHandler {
  queueName = "onchain-metadata-index-process-token-uri-queue";
  maxRetries = 5;
  concurrency = 30;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 5000,
  } as BackoffStrategy;
  disableErrorLogs = true;

  public async process(payload: OnchainMetadataProcessTokenUriJobPayload) {
    const { contract, tokenId, uri } = payload;
    const retryCount = Number(this.rabbitMqMessage?.retryCount);

    let tokenMetadataIndexingDebug = 0;

    if ([1, 137, 11155111].includes(config.chainId)) {
      tokenMetadataIndexingDebug = await redis.sismember(
        "metadata-indexing-debug-contracts",
        contract
      );

      if (tokenMetadataIndexingDebug) {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "tokenMetadataIndexingDebug",
            message: `Start. contract=${contract}, tokenId=${tokenId}, uri=${uri}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
            payload,
          })
        );
      }
    }

    let fallbackError;

    try {
      const metadata = await onchainMetadataProvider.getTokensMetadata([
        { contract, tokenId, uri },
      ]);

      if (metadata.length) {
        if (tokenMetadataIndexingDebug) {
          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "debugMissingTokenImages",
              message: `getTokensMetadata. contract=${contract}, tokenId=${tokenId}, uri=${uri}`,
              payload,
              metadata: JSON.stringify(metadata),
            })
          );
        }

        if (metadata[0].imageUrl?.startsWith("data:")) {
          if (config.fallbackMetadataIndexingMethod) {
            logger.warn(
              this.queueName,
              JSON.stringify({
                topic: tokenMetadataIndexingDebug
                  ? "debugMissingTokenImages"
                  : "simpleHashFallbackDebug",
                message: `Fallback - Image Encoding. contract=${contract}, tokenId=${tokenId}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
              })
            );

            await metadataIndexFetchJob.addToQueue(
              [
                {
                  kind: "single-token",
                  data: {
                    method: config.fallbackMetadataIndexingMethod,
                    contract,
                    tokenId,
                    collection: contract,
                    isFallback: true,
                  },
                  context: "onchain-fallback-image-encoding",
                },
              ],
              true,
              30
            );

            return;
          } else {
            metadata[0].imageUrl = null;
          }
        }

        // if missing imageMimeType/mediaMimeTyp, we fallback to simplehash
        if (
          (metadata[0].imageUrl && !metadata[0].imageMimeType) ||
          (metadata[0].mediaUrl && !metadata[0].mediaMimeType)
        ) {
          if (config.fallbackMetadataIndexingMethod) {
            logger.warn(
              this.queueName,
              JSON.stringify({
                topic: tokenMetadataIndexingDebug
                  ? "tokenMetadataIndexingDebug"
                  : "simpleHashFallbackDebug",
                message: `Fallback - Missing Mime Type. contract=${contract}, tokenId=${tokenId}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
                contract,
                metadata: JSON.stringify(metadata[0]),
                reason: "Missing Mime Type",
              })
            );

            await metadataIndexFetchJob.addToQueue(
              [
                {
                  kind: "single-token",
                  data: {
                    method: config.fallbackMetadataIndexingMethod,
                    contract,
                    tokenId,
                    collection: contract,
                    isFallback: true,
                  },
                  context: "onchain-fallback-missing-mime-type",
                },
              ],
              true,
              30
            );

            return;
          }
        }

        // if the imageMimeType/mediaMimeType is gif, we fallback to simplehash
        if (
          metadata[0].imageMimeType === "image/gif" ||
          metadata[0].mediaMimeType === "image/gif"
        ) {
          if (config.fallbackMetadataIndexingMethod) {
            logger.warn(
              this.queueName,
              JSON.stringify({
                topic: tokenMetadataIndexingDebug
                  ? "tokenMetadataIndexingDebug"
                  : "simpleHashFallbackDebug",
                message: `Fallback - GIF. contract=${contract}, tokenId=${tokenId}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
                contract,
                reason: "GIF",
              })
            );

            await metadataIndexFetchJob.addToQueue(
              [
                {
                  kind: "single-token",
                  data: {
                    method: config.fallbackMetadataIndexingMethod,
                    contract,
                    tokenId,
                    collection: contract,
                    isFallback: true,
                  },
                  context: "onchain-fallback-gif",
                },
              ],
              true,
              30
            );

            return;
          }
        }

        if (tokenMetadataIndexingDebug) {
          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "tokenMetadataIndexingDebug",
              message: `metadataIndexWriteJob. contract=${contract}, tokenId=${tokenId}, uri=${uri}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
              metadata: JSON.stringify(metadata),
            })
          );
        }

        await metadataIndexWriteJob.addToQueue(metadata);
        return;
      } else {
        logger.warn(
          this.queueName,
          `No metadata found. contract=${contract}, tokenId=${tokenId}, uri=${uri}`
        );
      }
    } catch (error) {
      if (
        error instanceof RequestWasThrottledError ||
        error instanceof TokenUriRequestTimeoutError ||
        error instanceof TokenUriNotFoundError ||
        error instanceof TokenUriRequestForbiddenError
      ) {
        // if this is the last retry, we don't throw to retry, and instead we fall back to simplehash
        if (retryCount < this.maxRetries) {
          throw error; // throw to retry
        }
      }

      fallbackError = `${(error as any).message}`;

      if (fallbackError === "Not found") {
        try {
          const urlParts = uri.split("/");
          const tokenIdPart = urlParts[urlParts.length - 1];

          if (parseInt(tokenIdPart, 16) == Number(tokenId)) {
            const newUri = uri.replace(tokenIdPart, tokenId);

            await onchainMetadataProcessTokenUriJob.addToQueue({
              contract,
              tokenId,
              uri: newUri,
            });

            return;
          }
        } catch (error) {
          logger.error(
            this.queueName,
            JSON.stringify({
              topic: "simpleHashFallbackDebug",
              message: `Not found Error - Error Parsing TokenId. contract=${contract}, tokenId=${tokenId}, uri=${uri}`,
              payload,
              error,
            })
          );
        }
      }

      try {
        const simplehashFallbackFailures = await redis.get(
          `simplehash-fallback-failures:${contract}`
        );

        if (simplehashFallbackFailures) {
          const simplehashFallbackFailuresCount = Number(simplehashFallbackFailures);

          if (simplehashFallbackFailuresCount >= 100) {
            logger.info(
              this.queueName,
              JSON.stringify({
                topic: "simpleHashFallbackDebug",
                message: `Skip Fallback - Too Many Failures. contract=${contract}, tokenId=${tokenId}, uri=${uri}`,
                payload,
                simplehashFallbackFailuresCount,
              })
            );

            return;
          }
        }
      } catch (error) {
        logger.error(
          this.queueName,
          JSON.stringify({
            topic: "simpleHashFallbackDebug",
            message: `Skip Fallback Error. contract=${contract}, tokenId=${tokenId}, uri=${uri}, error=${error}`,
            contract,
            tokenId,
            error,
          })
        );
      }

      logger.warn(
        this.queueName,
        JSON.stringify({
          topic: tokenMetadataIndexingDebug
            ? "tokenMetadataIndexingDebug"
            : "simpleHashFallbackDebug",
          message: `Error. contract=${contract}, tokenId=${tokenId}, uri=${uri}, retryCount=${retryCount}, error=${error}`,
          contract,
          tokenId,
          error: fallbackError,
        })
      );
    }

    if (!config.fallbackMetadataIndexingMethod) {
      return;
    }

    if (fallbackError === "Invalid URI") {
      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "simpleHashFallbackDebug",
          message: `Skip Fallback. contract=${contract}, tokenId=${tokenId}, uri=${uri}`,
          payload,
        })
      );

      return;
    }

    logger.info(
      this.queueName,
      JSON.stringify({
        topic: "simpleHashFallbackDebug",
        message: `Fallback - Get Metadata Error. contract=${contract}, tokenId=${tokenId}, uri=${uri}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
        payload,
        reason: "Get Metadata Error",
        error: fallbackError,
        retryCount,
        maxRetriesReached: retryCount >= this.maxRetries,
      })
    );

    await redis.hset(
      "simplehash-fallback-debug-tokens-v2",
      `${contract}:${tokenId}`,
      `${fallbackError}`
    );

    // for whatever reason, we didn't find the metadata, we fall back to simplehash
    await metadataIndexFetchJob.addToQueue(
      [
        {
          kind: "single-token",
          data: {
            method: config.fallbackMetadataIndexingMethod,
            contract,
            tokenId,
            collection: contract,
            isFallback: true,
          },
          context: "onchain-fallback-get-metadata-error",
        },
      ],
      true,
      30
    );
  }

  public async addToQueue(params: OnchainMetadataProcessTokenUriJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }

  public async addToQueueBulk(params: OnchainMetadataProcessTokenUriJobPayload[]) {
    await this.sendBatch(
      params.map((param) => {
        return { payload: param };
      })
    );
  }
}

export const onchainMetadataProcessTokenUriJob = new OnchainMetadataProcessTokenUriJob();
