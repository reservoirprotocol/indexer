import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { backfillQueueJob } from "@/jobs/events-sync/backfill-queue-job";
import { EventSubKind } from "@/events-sync/data";

export type ProcessResyncRequestQueueJobPayload = {
  fromBlock: number;
  toBlock: number;
  backfill?: boolean;
  blocksPerBatch?: number;
  syncDetails?:
    | {
        method: "events";
        events: EventSubKind[];
      }
    | {
        method: "address";
        address: string;
      };
};

export class ProcessResyncRequestQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "process-resync-request";
  maxRetries = 10;
  concurrency = 15;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: ProcessResyncRequestQueueJobPayload) {
    const { fromBlock, toBlock, backfill, syncDetails, blocksPerBatch } = payload;

    await backfillQueueJob.addToQueue(fromBlock, toBlock, {
      backfill,
      syncDetails,
      blocksPerBatch,
    });
  }

  public async addToQueue(
    fromBlock: number,
    toBlock: number,
    options?: {
      delay?: number;
      blocksPerBatch?: number;
      prioritized?: boolean;
      backfill?: boolean;
      syncDetails?:
        | {
            method: "events";
            events: EventSubKind[];
          }
        | {
            method: "address";
            address: string;
          };
    }
  ) {
    const prioritized = options?.prioritized ?? false;
    const jobId = `${fromBlock}-${toBlock}`;

    await this.send(
      {
        payload: {
          fromBlock: fromBlock,
          toBlock: toBlock,
          backfill: options?.backfill,
          syncDetails: options?.syncDetails,
          blocksPerBatch: options?.blocksPerBatch,
        },
        jobId,
      },
      options?.delay,
      prioritized ? 1 : 0
    );
  }
}

export const processResyncRequestQueueJob = new ProcessResyncRequestQueueJob();
