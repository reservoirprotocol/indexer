import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";

export type EventsSyncNftTransfersWriteBufferPayload = {
  query: string;
};

export class EventsSyncNftTransfersWriteBufferJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-nft-transfers-write";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;
  timeout = 60000;

  public async process(payload: EventsSyncNftTransfersWriteBufferPayload) {
    const { query } = payload;

    try {
      await idb.manyOrNone(query);
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
