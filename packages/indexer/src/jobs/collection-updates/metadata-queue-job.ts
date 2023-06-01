import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { acquireLock, releaseLock } from "@/common/redis";
import { logger } from "@/common/logger";
import { Collections } from "@/models/collections";
import _ from "lodash";

export type CollectionMetadataInfo = {
  contract: string;
  tokenId: string;
  community: string;
  forceRefresh?: boolean;
};

export type MetadataQueueJobPayload = {
  contract: string;
  tokenId: string;
  community: string;
  forceRefresh?: boolean;
  addToQueue?: boolean;
};

export class MetadataQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "collections-metadata-queue";
  maxRetries = 10;
  concurrency = 20;

  protected async process(payload: MetadataQueueJobPayload) {
    if (
      payload.forceRefresh ||
      (await acquireLock(`${this.queueName}:${payload.contract}`, 5 * 60))
    ) {
      if (await acquireLock(this.queueName, 1)) {
        try {
          await Collections.updateCollectionCache(
            payload.contract,
            payload.tokenId,
            payload.community
          );
        } catch (error) {
          logger.error(
            this.queueName,
            JSON.stringify({
              message: "updateCollectionCache error",
              jobData: payload,
              error,
            })
          );
        }
      } else {
        payload.addToQueue = true;

        if (!payload.forceRefresh) {
          await releaseLock(`${this.queueName}:${payload.contract}`);
        }
      }
    }
  }

  public async addToQueueBulk(collectionMetadataInfos: CollectionMetadataInfo[], delay = 0) {
    await this.sendBatch(
      collectionMetadataInfos.map((params) => ({ payload: params })),
      delay
    );
  }

  public async addToQueue(
    params: {
      contract: string | { contract: string; community: string }[];
      tokenId?: string;
      community?: string;
      forceRefresh?: boolean;
    },
    delay = 0
  ) {
    params.tokenId = params.tokenId ?? "1";
    params.community = params.community ?? "";
    params.forceRefresh = params.forceRefresh ?? false;

    if (_.isArray(params.contract)) {
      await this.sendBatch(
        params.contract.map((p) => ({
          payload: {
            contract: p.contract,
            tokenId: params.tokenId,
            community: p.community,
            forceRefresh: params.forceRefresh,
          },
        })),
        delay
      );
    } else {
      await this.send(
        {
          payload: {
            contract: params.contract,
            tokenId: params.tokenId,
            community: params.community,
            forceRefresh: params.forceRefresh,
          },
        },
        delay
      );
    }
  }
}

export const metadataQueueJob = new MetadataQueueJob();

metadataQueueJob.on("onCompleted", async (message) => {
  if (message.payload.addToQueue) {
    await metadataQueueJob.addToQueue(message.payload, 1000);
  }
});
