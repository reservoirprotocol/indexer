import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { EventSubKind } from "@/events-sync/data";
import { eventsSyncBackfillJob } from "@/jobs/events-sync/events-sync-backfill-job";

export type ProcessResyncRequestJobPayload = {
  fromBlock: number;
  toBlock: number;
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
  blocksPerBatch?: number;
};

export default class ProcessResyncRequestJob extends AbstractRabbitMqJobHandler {
  queueName = "process-resync-request";
  maxRetries = 10;
  concurrency = 10;
  useSharedChannel = true;

  public async process(payload: ProcessResyncRequestJobPayload) {
    const { fromBlock, toBlock, backfill, syncDetails, blocksPerBatch } = payload;

    await eventsSyncBackfillJob.addToQueue(fromBlock, toBlock, {
      backfill,
      syncDetails,
      blocksPerBatch,
    });
  }

  public async addToQueue(
    fromBlock: number,
    toBlock: number,
    options?: {
      attempts?: number;
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
    const prioritized = options?.prioritized ? 1 : 0;
    const jobId = `${fromBlock}-${toBlock}`;

    const data = {
      fromBlock: fromBlock,
      toBlock: toBlock,
      backfill: options?.backfill,
      syncDetails: options?.syncDetails,
      blocksPerBatch: options?.blocksPerBatch,
    };

    await this.send({ payload: data, jobId }, Number(options?.delay), prioritized);
  }
}

export const processResyncRequestJob = new ProcessResyncRequestJob();
