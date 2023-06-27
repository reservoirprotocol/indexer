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
};

export class CollectionMetadataQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "collections-metadata-queue";
  maxRetries = 10;
  concurrency = 20;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: MetadataQueueJobPayload) {
    const { contract, tokenId, community, forceRefresh } = payload;

    if (forceRefresh || (await acquireLock(`${this.queueName}:${contract}`, 5 * 60))) {
      if (await acquireLock(this.queueName, 1)) {
        try {
          if (isNaN(Number(tokenId)) || tokenId == null) {
            logger.error(
              this.queueName,
              `Invalid tokenId. contract=${contract}, tokenId=${tokenId}, community=${community}`
            );
          }

          await Collections.updateCollectionCache(contract, tokenId, community);
        } catch (error) {
          logger.error(
            this.queueName,
            JSON.stringify({
              message: `updateCollectionCache error ${JSON.stringify(error)}`,
              jobData: payload,
              error,
            })
          );
        }
      } else {
        if (!forceRefresh) {
          await releaseLock(`${this.queueName}:${contract}`);
        }

        await this.addToQueue(payload, 1000);
      }
    }
  }

  public async addToQueueBulk(
    collectionMetadataInfos: CollectionMetadataInfo[],
    delay = 0,
    context?: string
  ) {
    collectionMetadataInfos.forEach((collectionMetadataInfo) => {
      if (isNaN(Number(collectionMetadataInfo.tokenId)) || collectionMetadataInfo.tokenId == null) {
        logger.error(
          this.queueName,
          `Invalid tokenId. collectionMetadataInfo=${JSON.stringify(
            collectionMetadataInfo
          )}, context=${context}`
        );
      }
    });

    await this.sendBatch(collectionMetadataInfos.map((params) => ({ payload: params, delay })));
  }

  public async addToQueue(
    params: {
      contract: string | { contract: string; community: string }[];
      tokenId?: string;
      community?: string;
      forceRefresh?: boolean;
    },
    delay = 0,
    context?: string
  ) {
    if (isNaN(Number(params.tokenId)) || params.tokenId == null) {
      logger.error(
        this.queueName,
        `Invalid tokenId. contract=${params.contract}, tokenId=${params.tokenId}, community=${params.community}, context=${context}`
      );
    }
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
          delay,
        }))
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

export const collectionMetadataQueueJob = new CollectionMetadataQueueJob();
