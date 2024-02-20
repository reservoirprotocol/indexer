import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { config } from "@/config/index";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { logger } from "@/common/logger";
import MetadataProviderRouter from "@/metadata/metadata-provider-router";
import { metadataIndexWriteJob } from "@/jobs/metadata-index/metadata-write-job";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { RequestWasThrottledError } from "@/metadata/providers/utils";
import {
  metadataIndexFetchJob,
  MetadataIndexFetchJobPayload,
} from "@/jobs/metadata-index/metadata-fetch-job";
import { incrEx } from "@/common/redis";

export type MetadataIndexProcessJobPayload = {
  method: string;
};

export default class MetadataIndexProcessJob extends AbstractRabbitMqJobHandler {
  queueName = "metadata-index-process-queue";
  maxRetries = 10;
  concurrency = 1;
  singleActiveConsumer = true;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: MetadataIndexProcessJobPayload) {
    const { method } = payload;

    let count = 20; // Default number of tokens to fetch

    switch (method) {
      case "soundxyz":
        count = 10;
        break;

      case "simplehash":
        count = 50;
        break;

      case "onchain":
        count = 1;
        break;
    }

    const countTotal = method !== "soundxyz" ? config.maxParallelTokenRefreshJobs * count : count;

    // Get the tokens from the list
    const pendingRefreshTokens = new PendingRefreshTokens(method);
    const refreshTokens = await pendingRefreshTokens.get(countTotal);

    // If no more tokens
    if (_.isEmpty(refreshTokens)) {
      return;
    }

    const refreshTokensChunks = _.chunk(refreshTokens, count);

    let rateLimitExpiredIn = 0;

    const results = await Promise.all(
      refreshTokensChunks.map((refreshTokensChunk) =>
        MetadataProviderRouter.getTokensMetadata(
          refreshTokensChunk.map((refreshToken) => ({
            contract: refreshToken.contract,
            tokenId: refreshToken.tokenId,
          })),
          method
        ).catch(async (error) => {
          if (error instanceof RequestWasThrottledError) {
            logger.warn(
              this.queueName,
              `Too Many Requests. method=${method}, error=${JSON.stringify(error)}`
            );

            rateLimitExpiredIn = Math.max(rateLimitExpiredIn, error.delay, 5);
            // rateLimitExpiredIn = 5;

            await pendingRefreshTokens.add(refreshTokensChunk, true);
          } else {
            logger.error(
              this.queueName,
              `Error. method=${method}, status=${error.response?.status}, error=${JSON.stringify(
                error
              )}`
            );

            if (error.response?.data.error === "Request failed with status code 403") {
              await pendingRefreshTokens.add(refreshTokensChunk, true);
            }
          }

          return [];
        })
      )
    );

    const RefreshTokensMetadata = results.flat(1);

    await metadataIndexWriteJob.addToQueue(
      RefreshTokensMetadata.map((m) => ({
        ...m,
        metadataMethod: method,
      }))
    );

    try {
      for (const refreshTokensMetadata of RefreshTokensMetadata) {
        const refreshToken = refreshTokens.find(
          (refreshToken) =>
            refreshTokensMetadata.contract === refreshToken.contract &&
            refreshTokensMetadata.tokenId === refreshToken.tokenId
        );

        if (refreshToken?.isFallback && refreshTokensMetadata.imageUrl == null) {
          logger.info(
            this.queueName,
            JSON.stringify({
              message: `Fallback Refresh token missing image. method=${method}, contract=${refreshToken.contract}, tokenId=${refreshToken.tokenId}`,
              refreshTokensMetadata,
            })
          );
        }
      }

      if (RefreshTokensMetadata.length < refreshTokens.length) {
        const missingMetadataRefreshTokens = refreshTokens.filter(
          (obj1) =>
            !RefreshTokensMetadata.some(
              (obj2) => obj1.contract === obj2.contract && obj1.tokenId === obj2.tokenId
            )
        );

        if (missingMetadataRefreshTokens.length) {
          const metadataIndexInfos: MetadataIndexFetchJobPayload[] = [];

          for (const missingMetadataRefreshToken of missingMetadataRefreshTokens) {
            const missingMetadataRefreshTokenRetries = await incrEx(
              `missing-metadata-refresh-token:${method}:${missingMetadataRefreshToken.contract}:${missingMetadataRefreshToken.tokenId}`,
              300
            );

            logger.info(
              this.queueName,
              JSON.stringify({
                message: `Missing refresh token from provider - Retrying. method=${method}, contract=${missingMetadataRefreshToken.contract}, tokenId=${missingMetadataRefreshToken.tokenId}, retries=${missingMetadataRefreshTokenRetries}`,
                missingMetadataRefreshToken,
                missingMetadataRefreshTokenRetries,
              })
            );

            if (missingMetadataRefreshTokenRetries && missingMetadataRefreshTokenRetries <= 5) {
              metadataIndexInfos.push({
                kind: "single-token",
                data: {
                  method,
                  collection: missingMetadataRefreshToken.collection,
                  contract: missingMetadataRefreshToken.contract,
                  tokenId: missingMetadataRefreshToken.tokenId,
                },
                context: this.queueName,
              });
            } else {
              logger.warn(
                this.queueName,
                JSON.stringify({
                  message: `Missing refresh token from provider - Stop Retrying. method=${method}, contract=${missingMetadataRefreshToken.contract}, tokenId=${missingMetadataRefreshToken.tokenId}, retries=${missingMetadataRefreshTokenRetries}`,
                  missingMetadataRefreshToken,
                  missingMetadataRefreshTokenRetries,
                })
              );
            }
          }

          if (metadataIndexInfos.length) {
            await metadataIndexFetchJob.addToQueue(metadataIndexInfos, false, 15);
          }
        }
      }
    } catch (error) {
      logger.info(
        this.queueName,
        JSON.stringify({
          message: `Fallback Refresh token missing image. method=${method}, error=${error}`,
          error,
        })
      );
    }

    // If there are potentially more tokens to process trigger another job
    if (rateLimitExpiredIn || _.size(refreshTokens) == countTotal) {
      return rateLimitExpiredIn || 1;
    }

    return 0;
  }

  public async onCompleted(rabbitMqMessage: RabbitMQMessage, processResult: undefined | number) {
    if (processResult) {
      const { method } = rabbitMqMessage.payload;
      await this.addToQueue({ method }, processResult * 1000);
    }
  }

  public async addToQueue(params: MetadataIndexProcessJobPayload, delay = 0) {
    await this.send({ payload: params, jobId: params.method }, delay);
  }
}

export const metadataIndexProcessJob = new MetadataIndexProcessJob();
