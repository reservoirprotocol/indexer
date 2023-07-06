import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { Collections } from "@/models/collections";
import { logger } from "@/common/logger";
import _ from "lodash";

export type RefreshActivitiesCollectionMetadataJobPayload = {
  collectionId: string;
  collectionUpdateData?: { name: string | null; image: string | null };
};

export class RefreshActivitiesCollectionMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-activities-collection-metadata-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshActivitiesCollectionMetadataJobPayload) {
    logger.info(this.queueName, `Worker started. payload=${JSON.stringify(payload)}`);

    const collectionId = payload.collectionId;
    let collectionUpdateData = payload.collectionUpdateData;

    if (!collectionUpdateData) {
      const collectionData = await Collections.getById(collectionId);

      if (collectionData) {
        collectionUpdateData = {
          name: collectionData.name || null,
          image: collectionData.metadata?.imageUrl || null,
        };
      }
    }

    if (!_.isEmpty(collectionUpdateData)) {
      const keepGoing = await ActivitiesIndex.updateActivitiesCollectionMetadata(
        collectionId,
        collectionUpdateData
      );

      if (keepGoing) {
        await this.addToQueue({ collectionId, collectionUpdateData });
      }
    }
  }

  public async addToQueue(payload: RefreshActivitiesCollectionMetadataJobPayload) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload });
  }
}

export const refreshActivitiesCollectionMetadataJob = new RefreshActivitiesCollectionMetadataJob();
