import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { EventSubKind } from "@/events-sync/data";
import { syncEvents } from "@/events-sync/index";
import { logger } from "@/common/logger";
import { getNetworkSettings } from "@/config/network";
import _ from "lodash";

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

export default class EventsSyncBackfillJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-backfill";
  maxRetries = 10;
  concurrency = 2;
  lazyMode = true;
  timeout = 60000;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  public async process(payload: ProcessResyncRequestJobPayload) {
    const { fromBlock, toBlock, syncDetails, backfill } = payload;

    try {
      await syncEvents(fromBlock, toBlock, { backfill, syncDetails });
      //logger.info(this.queueName, `Events backfill syncing block range [${fromBlock}, ${toBlock}]`);
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
    // Syncing is done in several batches since the requested block
    // range might result in lots of events which could potentially
    // not fit within a single provider response
    const blocksPerBatch = options?.blocksPerBatch ?? getNetworkSettings().backfillBlockBatchSize;

    // Sync in reverse to handle more recent events first
    const jobs = [];
    for (let to = toBlock; to >= fromBlock; to -= blocksPerBatch) {
      const from = Math.max(fromBlock, to - blocksPerBatch + 1);
      const jobId = options?.attempts ? `${from}-${to}-${options.attempts}` : `${from}-${to}`;

      jobs.push({
        payload: {
          fromBlock: from,
          toBlock: to,
          backfill: options?.backfill,
          syncDetails: options?.syncDetails,
        },
        jobId,
        delay: Number(options?.delay),
        priority: options?.prioritized ? 1 : 0,
      });
    }

    for (const chunkedJobs of _.chunk(jobs, 1000)) {
      await this.sendBatch(
        chunkedJobs.map((job) => ({
          payload: job.payload,
          jobId: job.jobId,
          delay: job.delay,
          priority: job.priority,
        }))
      );
    }
  }
}

export const eventsSyncBackfillJob = new EventsSyncBackfillJob();
