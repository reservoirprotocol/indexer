import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { Collections } from "@/models/collections";
import { logger } from "@/common/logger";

export type FixActivitiesMissingCollectionJobPayload = {
  contract: string;
  tokenId: string;
  retry?: number;
};

export default class FixActivitiesMissingCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "fix-activities-missing-collection-queue";
  maxRetries = 10;
  concurrency = 3;
  persistent = true;

  public async process(payload: FixActivitiesMissingCollectionJobPayload) {
    const { contract, tokenId, retry } = payload;

    const collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));

    if (collection) {
      // Update the collection id of any missing activities
      const keepGoing = await ActivitiesIndex.updateActivitiesMissingCollection(
        contract,
        Number(tokenId),
        collection
      );

      if (keepGoing) {
        await this.addToQueue(payload, true);
      }
    } else if (Number(retry) < this.maxRetries) {
      await this.addToQueue({ ...payload, retry: Number(retry) + 1 });
    } else {
      logger.debug(this.queueName, `Max retries reached for ${JSON.stringify(payload)}`);
    }
  }

  public async addToQueue(payload: FixActivitiesMissingCollectionJobPayload, force = false) {
    if (!config.doElasticsearchWork) {
      return;
    }

    payload.retry = payload.retry ?? 0;

    let jobId;

    if (!force) {
      jobId = `${payload.contract}:${payload.tokenId}:${payload.retry}`;
    }

    const delay = payload.retry ? payload.retry ** 2 * 300 * 1000 : 0;

    await this.send({ payload, jobId }, delay);
  }
}

export const fixActivitiesMissingCollectionJob = new FixActivitiesMissingCollectionJob();
