import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { edb } from "@/common/db";

export type FtTransfersJobPayload = {
  query: string;
};

export class FtTransfersJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-ft-transfers-write";
  maxRetries = 15;
  concurrency = 5;
  backoff = {
    type: "fixed",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: FtTransfersJobPayload) {
    const { query } = payload;

    try {
      await edb.none(query);
    } catch (error) {
      logger.error(this.queueName, `Failed flushing ft transfer events to the database: ${error}`);
      throw error;
    }
  }

  public async addToQueue(params: FtTransfersJobPayload) {
    await this.send({ payload: params });
  }
}

export const ftTransfersJob = new FtTransfersJob();
