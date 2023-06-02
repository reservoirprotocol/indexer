import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { edb } from "@/common/db";

export type FtTransfersJobJobPayload = {
  query: string;
};

export class FtTransfersJobJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-ft-transfers-write";
  maxRetries = 15;
  concurrency = 5;
  backoff = {
    type: "fixed",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: FtTransfersJobJobPayload) {
    const { query } = payload;

    try {
      await edb.none(query);
    } catch (error) {
      logger.error(this.queueName, `Failed flushing ft transfer events to the database: ${error}`);
      throw error;
    }
  }

  public async addToQueue(params: FtTransfersJobJobPayload) {
    await this.send({ payload: params });
  }
}

export const ftTransfersJobJob = new FtTransfersJobJob();
