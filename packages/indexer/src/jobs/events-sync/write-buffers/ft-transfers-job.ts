import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";

export type EventsSyncFtTransfersWriteBufferPayload = {
  query: string;
};

export class EventsSyncFtTransfersWriteBufferJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-ft-transfers-write";
  maxRetries = 10;
  concurrency = 15;
  lazyMode = true;

  protected async process(payload: EventsSyncFtTransfersWriteBufferPayload) {
    const { query } = payload;

    try {
      await edb.none(query);
    } catch (error) {
      logger.error(this.queueName, `Failed flushing ft transfer events to the database: ${error}`);
      throw error;
    }
  }

  public async addToQueue(params: EventsSyncFtTransfersWriteBufferPayload) {
    await this.send({ payload: params });
  }
}

export const eventsSyncFtTransfersWriteBufferJob = new EventsSyncFtTransfersWriteBufferJob();
