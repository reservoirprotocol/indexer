import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";

export type EventsSyncNftTransfersWriteBufferPayload = {
  query: string;
};

export class EventsSyncNftTransfersWriteBufferJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-nft-transfers-write";
  maxRetries = 10;
  concurrency = 10;
  lazyMode = true;

  protected async process(payload: EventsSyncNftTransfersWriteBufferPayload) {
    const { query } = payload;

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

  public async addToQueue(params: EventsSyncNftTransfersWriteBufferPayload) {
    await this.send({ payload: params });
  }
}

export const eventsSyncNftTransfersWriteBufferJob = new EventsSyncNftTransfersWriteBufferJob();
