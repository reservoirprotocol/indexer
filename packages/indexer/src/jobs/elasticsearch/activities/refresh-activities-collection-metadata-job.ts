import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { Collections } from "@/models/collections";
import _ from "lodash";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { ActivitiesCollectionUpdateData } from "@/elasticsearch/indexes/activities";
import { logger } from "@/common/logger";

export type RefreshActivitiesCollectionMetadataJobPayload = {
  collectionId: string;
  collectionUpdateData?: ActivitiesCollectionUpdateData;
  context?: string;
};

export default class RefreshActivitiesCollectionMetadataJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-activities-collection-metadata-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshActivitiesCollectionMetadataJobPayload) {
    let addToQueue = false;

    const collectionId = payload.collectionId;
    const collection = await Collections.getById(collectionId);

    const collectionUpdateData = {
      isSpam: Number(collection?.isSpam),
      nsfwStatus: Number(collection?.nsfwStatus),
    };

    if (!_.isEmpty(collectionUpdateData)) {
      const keepGoing = await ActivitiesIndex.updateActivitiesCollectionData(
        collectionId,
        collectionUpdateData
      );

      if (keepGoing) {
        addToQueue = true;
      }

      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "debugActivitiesErrors",
          message: `updateActivitiesCollectionMetadata! collectionId=${collectionId}`,
          payload,
          collectionId,
          collection,
          collectionUpdateData,
          keepGoing,
        })
      );

      return { addToQueue };
    }
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: { addToQueue: boolean }
  ) {
    if (processResult?.addToQueue) {
      rabbitMqMessage.payload.context = "onCompleted";

      await this.addToQueue(rabbitMqMessage.payload, 5000);
    }
  }

  public async addToQueue(payload: RefreshActivitiesCollectionMetadataJobPayload, delay = 0) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload, jobId: payload.collectionId }, delay);
  }
}

export const refreshActivitiesCollectionMetadataJob = new RefreshActivitiesCollectionMetadataJob();
