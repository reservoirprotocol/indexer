import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { config } from "@/config/index";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { logger } from "@/common/logger";
import MetadataProviderRouter from "@/metadata/metadata-provider-router";
import { metadataIndexWriteJob } from "@/jobs/metadata-index/metadata-write-job";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { RequestWasThrottledError } from "@/metadata/providers/utils";

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

    const metadata = results.flat(1);

    if (metadata.length < refreshTokens.length) {
      const missingMetadata = refreshTokens.filter(
        (obj1) =>
          !metadata.some((obj2) => obj1.contract === obj2.contract && obj1.tokenId === obj2.tokenId)
      );

      logger.info(
        this.queueName,
        JSON.stringify({
          message: `Debug. method=${method}, refreshTokensCount=${refreshTokens.length}, metadataCount=${metadata.length}, rateLimitExpiredIn=${rateLimitExpiredIn}`,
          missingMetadata,
        })
      );
    }

    await metadataIndexWriteJob.addToQueue(
      metadata.map((m) => ({
        ...m,
        metadataMethod: method,
      }))
    );

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
