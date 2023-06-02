import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { MqJobsDataManager } from "@/models/mq-jobs-data";
import _ from "lodash";
import { EventsBatch, processEventsBatch } from "@/events-sync/handlers";
import { randomUUID } from "crypto";

export type BackfillJobPayload = {
  id: string;
};

export class BackfillJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-process-backfill";
  maxRetries = 10;
  concurrency = 15;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: BackfillJobPayload) {
    const { id } = payload;

    const batch = (await MqJobsDataManager.getJobData(id)) as EventsBatch;
    if (batch) {
      try {
        if (batch.id) {
          await processEventsBatch(batch);
        } else {
          await processEventsBatch({
            id: randomUUID(),
            events: [
              {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                kind: (batch as any).kind,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data: (batch as any).events,
              },
            ],
            backfill: batch.backfill,
          });
        }
      } catch (error) {
        logger.error(this.queueName, `Events processing failed: ${error}`);
        throw error;
      }
    }
  }

  public async addToQueue(batches: EventsBatch[]) {
    const jobs: { payload: { id: string } }[] = [];
    for (const batch of batches) {
      const ids = await MqJobsDataManager.addMultipleJobData(this.queueName, batch);
      for (const id of ids) {
        jobs.push({ payload: { id } });
      }
    }

    await this.sendBatch(jobs.map((j) => ({ payload: j.payload })));
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

export const backfillJob = new BackfillJob();
