import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Activities } from "@/models/activities";
import { UserActivities } from "@/models/user-activities";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { Collections } from "@/models/collections";
import { logger } from "@/common/logger";

export type FixActivitiesMissingCollectionJobPayload = {
  contract: string;
  tokenId: string;
  retry?: number;
  addToQueue?: boolean;
};

export class FixActivitiesMissingCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "fix-activities-missing-collection-queue";
  maxRetries = 5;
  concurrency = 15;

  protected async process(payload: FixActivitiesMissingCollectionJobPayload) {
    const maxRetries = 5;
    const collection = await Collections.getByContractAndTokenId(
      payload.contract,
      Number(payload.tokenId)
    );

    payload.addToQueue = false;

    if (collection) {
      // Update the collection id of any missing activities
      await Promise.all([
        Activities.updateMissingCollectionId(payload.contract, payload.tokenId, collection.id),
        UserActivities.updateMissingCollectionId(payload.contract, payload.tokenId, collection.id),
      ]);

      if (config.doElasticsearchWork) {
        await ActivitiesIndex.updateActivitiesMissingCollection(
          payload.contract,
          Number(payload.tokenId),
          collection
        );
      }
    } else if (Number(payload.retry) < maxRetries) {
      payload.addToQueue = true;
    } else {
      logger.warn(this.queueName, `Max retries reached for ${JSON.stringify(payload)}`);
    }
  }

  public async addToQueue(params: FixActivitiesMissingCollectionJobPayload) {
    const jobId = `${params.contract}:${params.tokenId}`;
    params.retry = params.retry ?? 0;
    const delay = params.retry ? params.retry ** 2 * 300 * 1000 : 0;

    await this.send({ payload: params, jobId }, delay);
  }
}

export const fixActivitiesMissingCollectionJob = new FixActivitiesMissingCollectionJob();
