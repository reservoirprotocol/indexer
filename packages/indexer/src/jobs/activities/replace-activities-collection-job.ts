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

export class ReplaceActivitiesCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "replace-activities-collection-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: ReplaceActivitiesCollectionJobPayload) {
    logger.info(this.queueName, `Worker started. payload=${JSON.stringify(payload)}`);

    const { contract, tokenId, newCollectionId, oldCollectionId } = payload;

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
