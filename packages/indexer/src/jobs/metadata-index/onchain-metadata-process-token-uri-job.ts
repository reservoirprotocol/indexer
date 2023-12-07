import { logger } from "@/common/logger";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { metadataIndexWriteJob } from "@/jobs/metadata-index/metadata-write-job";
import { onchainMetadataProvider } from "@/metadata/providers/onchain-metadata-provider";
import { RequestWasThrottledError } from "@/metadata/providers/utils";
import { PendingRefreshTokens } from "@/models/pending-refresh-tokens";
import { metadataIndexProcessJob } from "@/jobs/metadata-index/metadata-process-job";
import { config } from "@/config/index";

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

    try {
      const metadata = await onchainMetadataProvider.getTokensMetadata([
        { contract, tokenId, uri },
      ]);

      if (metadata) {
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
        // logger.warn(
        //   this.queueName,
        //   `Request was throttled. contract=${contract}, tokenId=${tokenId}, uri=${uri}`
        // );

        // Add to queue again with a delay from the error if its a rate limit
        await this.addToQueue(payload, e.delay);
        return;
      }
      logger.error(
        this.queueName,
        `Error. contract=${contract}, tokenId=${tokenId}, uri=${uri}, error=${e}, falling back to=${config.fallbackMetadataIndexingMethod}`
      );
    }

    if (!config.fallbackMetadataIndexingMethod) {
      logger.error(
        this.queueName,
        `No fallbackMetadataIndexingMethod set. contract=${contract}, tokenId=${tokenId}, uri=${uri}`
      );
      return;
    }
    // for whatever reason, we didn't find the metadata, we fallback to simplehash
    const pendingRefreshTokens = new PendingRefreshTokens(config.fallbackMetadataIndexingMethod);
    await pendingRefreshTokens.add([
      {
        collection: contract,
        contract,
        tokenId,
      },
    ]);

    await metadataIndexProcessJob.addToQueue({ method: config.fallbackMetadataIndexingMethod });
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
