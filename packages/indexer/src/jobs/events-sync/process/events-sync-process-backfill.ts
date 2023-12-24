import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { logger } from "@/common/logger";
import { EventsBatch, processEventsBatch } from "@/events-sync/handlers";

export default class EventsSyncProcessBackfillJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-process-backfill";
  maxRetries = 10;
  concurrency = 5;
  lazyMode = true;
  timeout = 120000;

  protected async process(payload: EventsBatch) {
    const { id, events, backfill } = payload;

    try {
      await processEventsBatch({ id, events, backfill });
    } catch (error) {
      logger.error(this.queueName, `Events processing failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(batches: EventsBatch[]) {
    await this.sendBatch(batches.map((batch) => ({ payload: batch })));
  }
}

export const eventsSyncProcessBackfillJob = new EventsSyncProcessBackfillJob();
