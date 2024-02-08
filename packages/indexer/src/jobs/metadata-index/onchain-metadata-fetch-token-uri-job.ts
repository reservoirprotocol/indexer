import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";

import { logger } from "@/common/logger";
import { config } from "@/config/index";

import { onchainMetadataProvider } from "@/metadata/providers/onchain-metadata-provider";
import { onchainMetadataProcessTokenUriJob } from "@/jobs/metadata-index/onchain-metadata-process-token-uri-job";
import { RequestWasThrottledError } from "@/metadata/providers/utils";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { hasCustomHandler } from "@/metadata/custom";

export default class OnchainMetadataFetchTokenUriJob extends AbstractRabbitMqJobHandler {
  queueName = "onchain-metadata-index-fetch-uri-queue";
  maxRetries = 3;
  concurrency = 3;
  timeout = 5 * 60 * 1000;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process() {
    const count = 50; // Default number of tokens to fetch

    // Get the onchain tokens from the list
    const pendingRefreshTokens = new PendingRefreshTokens("onchain");
    let fetchTokens = await pendingRefreshTokens.get(count);

    // if the token has custom metadata, don't fetch it and instead process it
    const customTokens = fetchTokens.filter((token) => hasCustomHandler(token.contract));
    if (customTokens.length) {
      await onchainMetadataProcessTokenUriJob.addToQueueBulk(
        customTokens.map((token) => ({
          contract: token.contract,
          tokenId: token.tokenId,
          uri: "",
        }))
      );
    }

    // Filter out custom tokens
    fetchTokens = fetchTokens.filter((token) => !hasCustomHandler(token.contract));

    // If no more tokens
    if (_.isEmpty(fetchTokens)) {
      return;
    }

    let results: {
      contract: string;
      tokenId: string;
      uri: string | null;
      error?: string;
    }[] = [];

    try {
      results = await onchainMetadataProvider._getTokensMetadataUri(fetchTokens);
    } catch (e) {
      if (e instanceof RequestWasThrottledError) {
        logger.warn(
          this.queueName,
          `Request was throttled. fetchUriTokenCount=${fetchTokens.length}`
        );

        await pendingRefreshTokens.add(fetchTokens, true);

        // Add to queue again with a delay from the error
        await this.addToQueue(e.delay);
        return;
      }

      logger.error(
        this.queueName,
        `Error. fetchUriTokenCount=${fetchTokens.length}, tokens=${JSON.stringify(
          fetchTokens
        )}, error=${JSON.stringify(e)}`
      );
    }

    if (results?.length) {
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
          logger.info(
            this.queueName,
            JSON.stringify({
              topic: "simpleHashFallbackDebug",
              message: `No uri found. contract=${result.contract}, tokenId=${result.tokenId}, error=${result.error}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
              contract: result.contract,
              error: result.error,
              reason: "No uri found",
            })
          );

          // fallbackTokens.push({
          //   collection: result.contract,
          //   contract: result.contract,
          //   tokenId: result.tokenId,
          // });
        }
      });

      if (tokensToProcess.length) {
        await onchainMetadataProcessTokenUriJob.addToQueueBulk(tokensToProcess);
      }

      if (config.fallbackMetadataIndexingMethod && fallbackTokens.length) {
        logger.info(
          this.queueName,
          JSON.stringify({
            topic: "simpleHashFallbackDebug",
            message: `metadataIndexFetchJob. fallbackToken=${fallbackTokens.length}, fallbackMetadataIndexingMethod=${config.fallbackMetadataIndexingMethod}`,
          })
        );

        await metadataIndexFetchJob.addToQueue(
          fallbackTokens.map((fallbackToken) => ({
            kind: "single-token",
            data: {
              method: config.fallbackMetadataIndexingMethod!,
              contract: fallbackToken.contract,
              tokenId: fallbackToken.tokenId,
              collection: fallbackToken.collection,
            },
          })),
          true,
          5
        );
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
