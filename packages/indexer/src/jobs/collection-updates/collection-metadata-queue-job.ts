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
  retries?: number;
};

export default class CollectionMetadataQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "collections-metadata-queue";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: MetadataQueueJobPayload) {
    const { contract, tokenId, community, forceRefresh } = payload;
    const retries = payload.retries ?? 0;

    if (forceRefresh || (await acquireLock(`${this.queueName}:${contract}`, 5 * 60))) {
      if (await acquireLock(this.queueName, 1)) {
        try {
          await Collections.updateCollectionCache(contract, tokenId, community);
        } catch (error) {
          logger.error(
            this.queueName,
            JSON.stringify({
              message: `updateCollectionCache error. contract=${contract}, tokenId=${tokenId}, community=${community}, forceRefresh=${forceRefresh}, retries=${retries},error=${error}`,
              payload,
              error,
            })
          );

          if (retries < 5) {
            payload.forceRefresh = true;
            payload.retries = retries + 1;

            await this.addToQueue(payload, payload.retries * 1000 * 60);
          }
        }
      } else {
        if (!forceRefresh) {
          await releaseLock(`${this.queueName}:${contract}`);
        }

        await this.addToQueue(payload, 1000);
      }
    }
  }

  public async addToQueueBulk(collectionMetadataInfos: CollectionMetadataInfo[], delay = 0) {
    await this.sendBatch(collectionMetadataInfos.map((params) => ({ payload: params, delay })));
  }

  public async addToQueue(
    params: {
      contract: string | { contract: string; community: string }[];
      tokenId?: string;
      community?: string | null;
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
