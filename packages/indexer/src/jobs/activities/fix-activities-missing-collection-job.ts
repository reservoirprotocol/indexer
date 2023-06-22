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

export class FixActivitiesMissingCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "fix-activities-missing-collection-queue";
  maxRetries = 5;
  concurrency = 15;
  persistent = true;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: FixActivitiesMissingCollectionJobPayload) {
    const { contract, tokenId, retry } = payload;

    // Temporarily disable goerli prod
    if (config.chainId === 5 && config.environment === "prod") {
      return;
    }

    const collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));

    if (collection) {
      // Update the collection id of any missing activities
      await ActivitiesIndex.updateActivitiesMissingCollection(
        contract,
        Number(tokenId),
        collection
      );
    } else if (Number(retry) < this.maxRetries) {
      await this.addToQueue({ ...payload, retry: Number(retry) + 1 });
    } else {
      logger.debug(this.queueName, `Max retries reached for ${JSON.stringify(payload)}`);
    }
  }

  public async addToQueue(params: FixActivitiesMissingCollectionJobPayload) {
    if (!config.doElasticsearchWork) {
      return;
    }

    params.retry = params.retry ?? 0;
    const jobId = `${params.contract}:${params.tokenId}:${params.retry}`;
    const delay = params.retry ? params.retry ** 2 * 300 * 1000 : 0;

    await this.send({ payload: params, jobId }, delay);
  }
}

export const fixActivitiesMissingCollectionJob = new FixActivitiesMissingCollectionJob();
