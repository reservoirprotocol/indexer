import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";

import { logger } from "@/common/logger";
import { BullMQBulkJob, getMemUsage, redis } from "@/common/redis";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { EventSubKind } from "@/events-sync/data";
import { syncEvents } from "@/events-sync/index";

const QUEUE_NAME = "events-sync-backfill";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: true,
    removeOnFail: 10000,
    timeout: 120000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER AND EVENT SYNC BACKFILLER ONLY
if (config.doBackgroundWork && config.doEventsSyncBackfill) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { fromBlock, toBlock, syncDetails } = job.data;
      const { backfill } = job.data;

      // Check if redis is reaching max memory usage
      const maxMemUsage = 1024 * 1000 * 1000 * config.redisMaxMemoryGB;
      const currentMemUsage = await getMemUsage();
      if (currentMemUsage > maxMemUsage) {
        const delay = _.random(1000 * 60 * 60, 1000 * 60 * 120);
        logger.warn(
          QUEUE_NAME,
          `Max memory reached ${_.round(currentMemUsage / (1024 * 1000 * 1000), 2)} GB, delay job ${
            job.id
          } for ${_.round(delay / 1000)}s`
        );

        job.opts.attempts = _.toInteger(job.opts.attempts) + 2;
        await addToQueue(fromBlock, toBlock, _.merge(job.opts, job.data, { delay }));
        return;
      }

      try {
        await syncEvents(fromBlock, toBlock, { backfill, syncDetails });
        logger.info(QUEUE_NAME, `Events backfill syncing block range [${fromBlock}, ${toBlock}]`);
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Events for [${fromBlock}, ${toBlock}] backfill syncing failed: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
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
) => {
  // Syncing is done in several batches since the requested block
  // range might result in lots of events which could potentially
  // not fit within a single provider response
  const blocksPerBatch = options?.blocksPerBatch ?? getNetworkSettings().backfillBlockBatchSize;

  // Important backfill processes should be prioritized
  const prioritized = options?.prioritized ?? false;

  // Sync in reverse to handle more recent events first
  const jobs: BullMQBulkJob[] = [];
  for (let to = toBlock; to >= fromBlock; to -= blocksPerBatch) {
    const from = Math.max(fromBlock, to - blocksPerBatch + 1);
    const jobId = options?.attempts ? `${from}-${to}-${options.attempts}` : `${from}-${to}`;

    jobs.push({
      name: `${from}-${to}`,
      data: {
        fromBlock: from,
        toBlock: to,
        backfill: options?.backfill,
        syncDetails: options?.syncDetails,
      },
      opts: {
        priority: prioritized ? 1 : undefined,
        jobId,
        delay: options?.delay,
        attempts: options?.attempts,
      },
    });
  }

  for (const chunkedJobs of _.chunk(jobs, 1000)) {
    await queue.addBulk(chunkedJobs);
  }
};
