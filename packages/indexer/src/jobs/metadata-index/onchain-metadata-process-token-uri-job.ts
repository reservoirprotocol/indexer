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
  maxRetries = 10;
  concurrency = 15;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;
  disableErrorLogs = true;

  public async process(payload: OnchainMetadataProcessTokenUriJobPayload) {
    const { contract, tokenId, uri } = payload;
    const retryCount = Number(this.rabbitMqMessage?.retryCount);

    const debugMissingTokenImages = await redis.sismember(
      "missing-token-image-contracts",
      contract
    );

    if (debugMissingTokenImages) {
      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "debugMissingTokenImages",
          message: `Start. contract=${contract}, tokenId=${tokenId}, uri=${uri}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
          payload,
        })
      );
    }

    let fallbackError;

    try {
      const metadata = await onchainMetadataProvider.getTokensMetadata([
        { contract, tokenId, uri },
      ]);

      if (retryCount > 0 && config.chainId === 137) {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "simpleHashFallbackDebug",
            message: `Delayed getTokensMetadata. contract=${contract}, tokenId=${tokenId}, uri=${uri}, retryCount=${retryCount}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
            contract,
            tokenId,
            retryCount,
          })
        );
      }

      if (metadata.length) {
        if (debugMissingTokenImages) {
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
                topic: debugMissingTokenImages
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
                  },
                  context: "onchain-fallback-image-encoding",
                },
              ],
              true
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
                topic: debugMissingTokenImages
                  ? "debugMissingTokenImages"
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
                  },
                  context: "onchain-fallback-missing-mime-type",
                },
              ],
              true
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
                topic: debugMissingTokenImages
                  ? "debugMissingTokenImages"
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
                  },
                  context: "onchain-fallback-gif",
                },
              ],
              true
            );

            return;
          }
        }

        if (debugMissingTokenImages) {
          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "debugMissingTokenImages",
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
          if (config.chainId === 137) {
            logger.info(
              this.queueName,
              JSON.stringify({
                topic: "simpleHashFallbackDebug",
                message: `Retry getTokensMetadata. contract=${contract}, tokenId=${tokenId}, uri=${uri}, retryCount=${retryCount}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
                contract,
                tokenId,
                retryCount,
                error: `${error}`,
              })
            );
          }

          throw error; // throw to retry
        }
      }

      fallbackError = `${error}`;

      logger.warn(
        this.queueName,
        JSON.stringify({
          topic: debugMissingTokenImages ? "debugMissingTokenImages" : "simpleHashFallbackDebug",
          message: `Error. contract=${contract}, tokenId=${tokenId}, uri=${uri}, retryCount=${retryCount}, error=${error}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
          contract,
          tokenId,
          error: `${error}`,
        })
      );
    }

    if (!config.fallbackMetadataIndexingMethod) {
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
          },
          context: "onchain-fallback-get-metadata-error",
        },
      ],
      true
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
