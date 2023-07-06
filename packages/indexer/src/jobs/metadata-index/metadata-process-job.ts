import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { config } from "@/config/index";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { logger } from "@/common/logger";
import MetadataApi from "@/utils/metadata-api";
import { metadataIndexWriteJob } from "@/jobs/metadata-index/metadata-write-job";

export type MetadataIndexProcessJobPayload = {
  method: string;
};

export class MetadataIndexProcessJob extends AbstractRabbitMqJobHandler {
  queueName = "metadata-index-process-queue";
  maxRetries = 10;
  concurrency = 1;
  singleActiveConsumer = true;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: MetadataIndexProcessJobPayload) {
    const { method } = payload;

    let count = 20; // Default number of tokens to fetch

    switch (method) {
      case "soundxyz":
        count = 10;
        break;

      case "simplehash":
        count = 50;
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
        MetadataApi.getTokensMetadata(
          refreshTokensChunk.map((refreshToken) => ({
            contract: refreshToken.contract,
            tokenId: refreshToken.tokenId,
          })),
          method
        ).catch(async (error) => {
          if (error.response?.status === 429) {
            logger.warn(
              this.queueName,
              `Too Many Requests. method=${method}, error=${JSON.stringify(error.response.data)}`
            );

            rateLimitExpiredIn = Math.max(rateLimitExpiredIn, error.response.data.expires_in, 5);

            await pendingRefreshTokens.add(refreshTokensChunk, true);
          } else {
            logger.error(
              this.queueName,
              `Error. method=${method}, status=${error.response?.status}, error=${JSON.stringify(
                error.response?.data
              )}, refreshTokensChunk=${JSON.stringify(refreshTokensChunk)}`
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

    await metadataIndexWriteJob.addToQueue(
      metadata.map((m) => ({
        ...m,
      }))
    );

    // If there are potentially more tokens to process trigger another job
    if (rateLimitExpiredIn || _.size(refreshTokens) == countTotal) {
      await this.addToQueue({ method }, rateLimitExpiredIn * 1000);
    }
  }

  public async addToQueue(params: MetadataIndexProcessJobPayload, delay = 0) {
    await this.send({ payload: params, jobId: params.method }, delay);
  }
}

export const metadataIndexProcessJob = new MetadataIndexProcessJob();
