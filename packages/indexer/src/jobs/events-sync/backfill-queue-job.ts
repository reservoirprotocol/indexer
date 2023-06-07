import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import _ from "lodash";
import { syncEvents } from "@/events-sync/index";
import { EventSubKind } from "@/events-sync/data";
import { getNetworkSettings } from "@/config/network";

export type BackfillQueueJobPayload = {
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
};

export class BackfillQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-backfill";
  maxRetries = 10;
  concurrency = 10;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: BackfillQueueJobPayload) {
    const { fromBlock, toBlock, syncDetails } = payload;
    const { backfill } = payload;

    try {
      await syncEvents(fromBlock, toBlock, { backfill, syncDetails });
      logger.info(this.queueName, `Events backfill syncing block range [${fromBlock}, ${toBlock}]`);
    } catch (error) {
      logger.error(
        this.queueName,
        `Events for [${fromBlock}, ${toBlock}] backfill syncing failed: ${error}`
      );
      throw error;
    }
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
    // Syncing is done in several batches since the requested block
    // range might result in lots of events which could potentially
    // not fit within a single provider response
    const blocksPerBatch = options?.blocksPerBatch ?? getNetworkSettings().backfillBlockBatchSize;

    // Important backfill processes should be prioritized
    const prioritized = options?.prioritized ?? false;

    // Sync in reverse to handle more recent events first
    const jobs = [];
    for (let to = toBlock; to >= fromBlock; to -= blocksPerBatch) {
      const from = Math.max(fromBlock, to - blocksPerBatch + 1);
      const jobId = `${from}-${to}`;

      jobs.push({
        payload: {
          fromBlock: from,
          toBlock: to,
          backfill: options?.backfill,
          syncDetails: options?.syncDetails,
        },
        jobId,
      });
    }

    for (const chunkedJobs of _.chunk(jobs, 1000)) {
      await this.sendBatch(
        chunkedJobs.map((job) => ({
          payload: job.payload,
          jobId: job.jobId,
          delay: Number(options?.delay),
          priority: prioritized ? 1 : 0,
        }))
      );
    }
  }
}

export const backfillQueueJob = new BackfillQueueJob();
