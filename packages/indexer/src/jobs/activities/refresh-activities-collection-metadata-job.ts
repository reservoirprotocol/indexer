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

    if (payload.collectionId === "0x1a92f7381b9f03921564a437210bb9396471050c") {
      logger.info(
        this.queueName,
        JSON.stringify({
          message: `Start. payload=${payload.collectionId}, context=${payload.context}`,
          payload,
        })
      );
    }

    const collectionId = payload.collectionId;
    const collection = await Collections.getById(collectionId);

    const collectionUpdateData = {
      name: collection?.name || null,
      image: collection?.metadata?.imageUrl || null,
      isSpam: Number(collection?.isSpam),
    };

    if (!_.isEmpty(collectionUpdateData)) {
      const keepGoing = await ActivitiesIndex.updateActivitiesCollectionData(
        collectionId,
        collectionUpdateData
      );

      if (keepGoing) {
        addToQueue = true;
      }

      return { addToQueue };
    }
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: { addToQueue: boolean }
  ) {
    if (processResult?.addToQueue) {
      rabbitMqMessage.payload.context = "onCompleted";

      await this.addToQueue(rabbitMqMessage.payload);
    }
  }

  public async addToQueue(payload: RefreshActivitiesCollectionMetadataJobPayload) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload, jobId: payload.collectionId });
  }
}

export const refreshActivitiesCollectionMetadataJob = new RefreshActivitiesCollectionMetadataJob();
