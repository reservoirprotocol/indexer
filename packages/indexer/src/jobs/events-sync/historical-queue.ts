import { logger } from "@/common/logger";
import { syncEvents } from "@/events-sync/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

import { checkSupports } from "@/events-sync/supports";

export type EventsSyncHistoricalJobPayload = {
  block: number;
  syncEventsToMainDB?: boolean;
};

export class EventsSyncHistoricalJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-historical";
  maxRetries = 30;
  concurrency = 100;
  consumerTimeout = 60 * 1000;
  backoff = {
    type: "fixed",
    delay: 1000,
  } as BackoffStrategy;

  constructor() {
    super();
    checkSupports();
  }
  protected async process(payload: EventsSyncHistoricalJobPayload) {
    try {
      const { block, syncEventsToMainDB } = payload;

      await syncEvents(block, syncEventsToMainDB);
    } catch (error) {
      logger.warn(this.queueName, `Events historical syncing failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(params: EventsSyncHistoricalJobPayload, delay = 0) {
    await this.send({ payload: params, jobId: `${params.block}` }, delay);
  }
}

export const eventsSyncHistoricalJob = new EventsSyncHistoricalJob();
