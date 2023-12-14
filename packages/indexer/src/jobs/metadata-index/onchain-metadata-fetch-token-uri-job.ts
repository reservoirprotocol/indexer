import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";

import { logger } from "@/common/logger";
import { onchainMetadataProvider } from "@/metadata/providers/onchain-metadata-provider";
import { onchainMetadataProcessTokenUriJob } from "@/jobs/metadata-index/onchain-metadata-process-token-uri-job";
import { RequestWasThrottledError } from "@/metadata/providers/utils";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { metadataIndexProcessJob } from "@/jobs/metadata-index/metadata-process-job";
import { config } from "@/config/index";

export default class OnchainMetadataFetchTokenUriJob extends AbstractRabbitMqJobHandler {
  queueName = "onchain-metadata-index-fetch-uri-queue";
  maxRetries = 3;
  concurrency = 3;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process() {
    const count = 50; // Default number of tokens to fetch

    // Get the onchain tokens from the list
    const pendingRefreshTokens = new PendingRefreshTokens("onchain");
    const fetchTokens = await pendingRefreshTokens.get(count);

    // If no more tokens
    if (_.isEmpty(fetchTokens)) {
      return;
    }

    let results;
    try {
      results = await onchainMetadataProvider._getTokensMetadataUri(fetchTokens);
    } catch (e) {
      if (e instanceof RequestWasThrottledError) {
        logger.warn(
          this.queueName,
          `Request was throttled. fetchUriTokenCount=${fetchTokens.length}`
        );

        // Add to queue again with a delay from the error
        await this.addToQueue(e.delay);
        return;
      } else {
        logger.error(
          this.queueName,
          `Error. fetchUriTokenCount=${fetchTokens.length}, tokens=${JSON.stringify(
            fetchTokens
          )}, error=${JSON.stringify(e)}`
        );
        throw e;
      }
    }

    const tokensToProcess: {
      contract: string;
      tokenId: string;
      uri: string;
      error?: string;
    }[] = [];

    const fallbackTokens: {
      collection: string;
      contract: string;
      tokenId: string;
    }[] = [];

    // Filter out tokens that have no metadata
    results.forEach((result) => {
      if (result.uri) {
        tokensToProcess.push(result as { contract: string; tokenId: string; uri: string });
      } else {
        logger.warn(
          this.queueName,
          `No uri found. contract=${result.contract}, tokenId=${result.tokenId}, error=${result.error}, fallback=${config.fallbackMetadataIndexingMethod}`
        );

        fallbackTokens.push({
          collection: result.contract,
          contract: result.contract,
          tokenId: result.tokenId,
        });
      }
    });

    await onchainMetadataProcessTokenUriJob.addToQueueBulk(tokensToProcess);

    if (!_.isEmpty(fallbackTokens)) {
      if (config.fallbackMetadataIndexingMethod) {
        const pendingRefreshTokens = new PendingRefreshTokens(
          config.fallbackMetadataIndexingMethod
        );
        await pendingRefreshTokens.add(fallbackTokens);
        await metadataIndexProcessJob.addToQueue({
          method: config.fallbackMetadataIndexingMethod,
        });
      } else {
        logger.info(
          this.queueName,
          `No fallbackMetadataIndexingMethod set. fallbackTokenCount=${fallbackTokens.length}`
        );
        return;
      }
    }

    // If there are potentially more token uris to process, trigger another job
    const queueLength = await pendingRefreshTokens.length();
    if (queueLength > 0) {
      await this.addToQueue();
    }
  }

  public async addToQueue(delay = 0) {
    await this.send({}, delay);
  }
}

export const onchainMetadataFetchTokenUriJob = new OnchainMetadataFetchTokenUriJob();
