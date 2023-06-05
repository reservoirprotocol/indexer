import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { EventsBatch, processEventsBatch } from "@/events-sync/handlers";
import { EventKind } from "@/events-sync/data";

export type BackfillJobPayload = {
  batch: EventsBatch;
  kind: EventKind;
  backfill: boolean;
};

export class RealtimeJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-process-realtime";
  maxRetries = 10;
  concurrency = 10;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: BackfillJobPayload) {
    const { batch } = payload;

    try {
      if (batch) {
        await processEventsBatch(batch);
      }
    } catch (error) {
      logger.error(this.queueName, `Events processing failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(batches: EventsBatch[], prioritized?: boolean) {
    await this.sendBatch(
      batches.map((batch) => ({
        payload: { batch },
        jobId: batch.id,
        priority: prioritized ? 1 : 0,
      }))
    );
  }
}

export const realtimeJob = new RealtimeJob();
