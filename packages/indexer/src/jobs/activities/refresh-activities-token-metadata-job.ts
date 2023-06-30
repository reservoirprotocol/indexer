import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { Collections } from "@/models/collections";
import { logger } from "@/common/logger";
import _ from "lodash";
import { redis } from "@/common/redis";
import { Tokens } from "@/models/tokens";

export type RefreshActivitiesTokenMetadataJobPayload = {
  contract: string;
  tokenId: string;
  collectionId: string;
  tokenUpdateData?: { name: string | null; image: string | null; media: string | null };
  force?: boolean;
};

export class RefreshActivitiesTokenMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-activities-token-metadata-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshActivitiesTokenMetadataJobPayload) {
    logger.info(this.queueName, `Worker started. payload=${JSON.stringify(payload)}`);

    const { contract, tokenId, collectionId, force } = payload;

    let collectionDay30Rank;

    if (!force) {
      if (collectionId) {
        const collectionDay30RankCache = await redis.get(`collection-day-30-rank:${collectionId}`);

        if (collectionDay30RankCache != null) {
          collectionDay30Rank = Number(collectionDay30RankCache);
        }
      }

      if (!collectionDay30Rank) {
        const collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));

        if (collection) {
          collectionDay30Rank = collection.day30Rank;

          await redis.set(
            `collection-day-30-rank:${collection.id}`,
            collectionDay30Rank,
            "EX",
            3600
          );
        }
      }
    }

    if (force || (collectionDay30Rank && collectionDay30Rank <= 1000)) {
      const tokenUpdateData =
        payload.tokenUpdateData ?? (await Tokens.getByContractAndTokenId(contract, tokenId));

      if (!_.isEmpty(tokenUpdateData)) {
        const keepGoing = await ActivitiesIndex.updateActivitiesTokenMetadata(
          contract,
          tokenId,
          tokenUpdateData
        );

        if (keepGoing) {
          await this.addToQueue({ contract, tokenId, collectionId, tokenUpdateData, force });
        }
      }
    }
  }

  public async addToQueue(payload: RefreshActivitiesTokenMetadataJobPayload) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload });
  }
}

export const refreshActivitiesTokenMetadataJob = new RefreshActivitiesTokenMetadataJob();
