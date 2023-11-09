import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

import { logger } from "@/common/logger";
import { EventsBatch, processEventsBatch } from "@/events-sync/handlers";
import { config } from "@/config/index";

export default class EventsSyncProcessRealtimeJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-process-realtime";
  maxRetries = 10;
  concurrency = config.chainId === 137 ? 5 : 20;
  lazyMode = true;
  timeout = 120000;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  public async process(payload: EventsBatch) {
    const { id, events, backfill } = payload;

    try {
      await processEventsBatch({ id, events, backfill });
    } catch (error) {
      logger.error(this.queueName, `Events processing failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(batches: EventsBatch[], prioritized?: boolean) {
    await this.sendBatch(
      batches.map((batch) => ({ payload: batch, jobId: batch.id, priority: prioritized ? 1 : 0 }))
    );
  }
}

export const eventsSyncProcessRealtimeJob = new EventsSyncProcessRealtimeJob();
