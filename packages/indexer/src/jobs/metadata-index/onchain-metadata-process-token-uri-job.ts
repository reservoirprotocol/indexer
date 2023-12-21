import { logger } from "@/common/logger";
import { config } from "@/config/index";

import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { metadataIndexWriteJob } from "@/jobs/metadata-index/metadata-write-job";
import { onchainMetadataProvider } from "@/metadata/providers/onchain-metadata-provider";
import { RequestWasThrottledError } from "@/metadata/providers/utils";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";

export type OnchainMetadataProcessTokenUriJobPayload = {
  contract: string;
  tokenId: string;
  uri: string;
};

export default class OnchainMetadataProcessTokenUriJob extends AbstractRabbitMqJobHandler {
  queueName = "onchain-metadata-index-process-token-uri-queue";
  maxRetries = 3;
  concurrency = 15;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: OnchainMetadataProcessTokenUriJobPayload) {
    const { contract, tokenId, uri } = payload;
    let fallbackAllowed = true;

    try {
      const metadata = await onchainMetadataProvider.getTokensMetadata([
        { contract, tokenId, uri },
      ]);

      if (metadata.length) {
        logger.info(
          this.queueName,
          `Found metadata. contract=${contract}, tokenId=${tokenId}, uri=${uri}, metadata=${JSON.stringify(
            metadata
          )}`
        );
        if (metadata[0].imageUrl?.startsWith("data:")) {
          if (config.fallbackMetadataIndexingMethod) {
            logger.info(
              this.queueName,
              `Fallback - Image Encoding. contract=${contract}, tokenId=${tokenId}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`
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
                },
              ],
              true,
              5
            );
            return;
          } else {
            metadata[0].imageUrl = null;
          }
        }

        // if the imageMimeType/mediaMimeType is gif, we fallback to simplehash
        if (
          metadata[0].imageMimeType === "image/gif" ||
          metadata[0].mediaMimeType === "image/gif"
        ) {
          logger.info(
            this.queueName,
            `found Fallback - GIF. contract=${contract}, tokenId=${tokenId}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`
          );
          if (config.fallbackMetadataIndexingMethod) {
            logger.info(
              this.queueName,
              `Fallback - GIF. contract=${contract}, tokenId=${tokenId}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`
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
                },
              ],
              true,
              5
            );
            return;
          }
        }

        await metadataIndexWriteJob.addToQueue(metadata);
        return;
      } else {
        logger.warn(
          this.queueName,
          `No metadata found. contract=${contract}, tokenId=${tokenId}, uri=${uri}`
        );
      }
    } catch (e) {
      if (e instanceof RequestWasThrottledError) {
        logger.warn(
          this.queueName,
          `Request was throttled. contract=${contract}, tokenId=${tokenId}, uri=${uri}`
        );

        // if this is the last retry, we don't throw to retry, and instead we fall back to simplehash
        if (Number(this.rabbitMqMessage?.retryCount) < this.maxRetries) {
          throw e; // throw to retry
        }
      }

      fallbackAllowed = !["404"].includes(`${e}`);

      logger.warn(
        this.queueName,
        JSON.stringify({
          message: `Error. contract=${contract}, tokenId=${tokenId}, uri=${uri}, error=${e}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
          contract,
          tokenId,
          fallbackAllowed,
          error: `${e}`,
        })
      );
    }

    if (!fallbackAllowed || !config.fallbackMetadataIndexingMethod) {
      return;
    }

    logger.info(
      this.queueName,
      `Fallback - Get Metadata Error. contract=${contract}, tokenId=${tokenId}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`
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
        },
      ],
      true,
      5
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
