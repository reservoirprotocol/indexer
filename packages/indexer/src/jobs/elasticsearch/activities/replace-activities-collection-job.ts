import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { Collections } from "@/models/collections";
import { logger } from "@/common/logger";

export type ReplaceActivitiesCollectionJobPayload = {
  contract: string;
  tokenId: string;
  newCollectionId: string;
  oldCollectionId: string;
};

export default class ReplaceActivitiesCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "replace-activities-collection-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: ReplaceActivitiesCollectionJobPayload) {
    const { contract, tokenId, newCollectionId, oldCollectionId } = payload;

    if (
      [
        "0x4e9edbb6fa91a4859d14f98627dba991d16c9f10",
        "0x95a2c45003b86235bb3e05b6f3b8b7781e562f2b",
        "0xd7f566aeba20453e9bab7ea2fd737bfaec70cc69",
      ].includes(contract)
    ) {
      return;
    }

    const collection = await Collections.getById(newCollectionId);

    if (collection) {
      const keepGoing = await ActivitiesIndex.updateActivitiesCollection(
        contract,
        tokenId,
        collection,
        oldCollectionId
      );

      if (keepGoing) {
        await this.addToQueue(payload, true);
      }

      logger.info(
        this.queueName,
        JSON.stringify({
          topic: "debugActivitiesErrors",
          message: `updateActivitiesCollection! collectionId=${newCollectionId}, oldCollectionId=${oldCollectionId}`,
          payload,
          collection,
          keepGoing,
        })
      );
    }
  }

  public async addToQueue(payload: ReplaceActivitiesCollectionJobPayload, force = false) {
    if (!config.doElasticsearchWork) {
      return;
    }

    let jobId;

    if (!force) {
      jobId = `${payload.contract}:${payload.tokenId}:${payload.newCollectionId}`;
    }

    await this.send({ payload, jobId });
  }
}

export const replaceActivitiesCollectionJob = new ReplaceActivitiesCollectionJob();
