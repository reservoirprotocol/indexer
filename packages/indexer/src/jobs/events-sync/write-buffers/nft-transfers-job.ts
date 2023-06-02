import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { MqJobsDataManager } from "@/models/mq-jobs-data";
import _ from "lodash";

export type NftTransfersJobJobPayload = {
  id: string;
};

export class NftTransfersJobJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-nft-transfers-write";
  maxRetries = 15;
  concurrency = 5;
  backoff = {
    type: "fixed",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: NftTransfersJobJobPayload) {
    const { id } = payload;

    const { query } = (await MqJobsDataManager.getJobData(id)) || {};
    if (!query) {
      return;
    }

    try {
      await idb.none(query);
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed flushing nft transfer events to the database: ${query} error=${error}`
      );
      throw error;
    }
  }

  public async addToQueue(query: string) {
    const ids = await MqJobsDataManager.addMultipleJobData(this.queueName, { query });
    await Promise.all(_.map(ids, async (id) => await this.send({ payload: { id } })));
  }

  public async addToQueueByJobDataId(ids: string | string[]) {
    if (_.isArray(ids)) {
      const jobs: { payload: { id: string } }[] = [];

      for (const id of ids) {
        jobs.push({ payload: { id } });
      }

      await this.sendBatch(jobs.map((j) => ({ payload: j.payload })));
    } else {
      await this.send({ payload: { id: ids } });
    }
  }
}

export const nftTransfersJobJob = new NftTransfersJobJob();
