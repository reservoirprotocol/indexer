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
    // Temporarily disable goerli prod
    if (config.chainId === 5 && config.environment === "prod") {
      return;
    }
    const { contract, tokenId, retry } = payload;
    const collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));

    payload.addToQueue = false;

    if (collection) {
      // Update the collection id of any missing activities
      await Promise.all([
        Activities.updateMissingCollectionId(contract, tokenId, collection.id),
        UserActivities.updateMissingCollectionId(contract, tokenId, collection.id),
      ]);

      if (config.doElasticsearchWork) {
        await ActivitiesIndex.updateActivitiesMissingCollection(
          contract,
          Number(tokenId),
          collection
        );
      }
    } else if (Number(retry) < this.maxRetries) {
      payload.addToQueue = true;
    } else {
      logger.debug(this.queueName, `Max retries reached for ${JSON.stringify(payload)}`);
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
