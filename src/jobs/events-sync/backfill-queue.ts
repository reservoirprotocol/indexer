import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { BullMQBulkJob, redis } from "@/common/redis";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { EventDataKind } from "@/events-sync/data";
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

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { fromBlock, toBlock, backfill, eventDataKinds } = job.data;

      try {
        logger.info(QUEUE_NAME, `Events backfill syncing block range [${fromBlock}, ${toBlock}]`);

        await syncEvents(fromBlock, toBlock, { backfill, eventDataKinds });
      } catch (error) {
        logger.error(QUEUE_NAME, `Events backfill syncing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (
  fromBlock: number,
  toBlock: number,
  options?: {
    blocksPerBatch?: number;
    prioritized?: boolean;
    backfill?: boolean;
    eventDataKinds?: EventDataKind[];
  }
) => {
  // Syncing is done in several batches since the requested block
  // range might result in lots of events which could potentially
  // not fit within a single provider response.
  const blocksPerBatch = options?.blocksPerBatch ?? getNetworkSettings().backfillBlockBatchSize;

  // Important backfill processes should be prioritized
  const prioritized = options?.prioritized ?? false;

  // Sync in reverse to handle more recent events first
  const jobs: BullMQBulkJob[] = [];
  for (let to = toBlock; to >= fromBlock; to -= blocksPerBatch) {
    const from = Math.max(fromBlock, to - blocksPerBatch + 1);
    jobs.push({
      name: `${from}-${to}`,
      data: {
        fromBlock: from,
        toBlock: to,
        backfill: options?.backfill,
        eventDataKinds: options?.eventDataKinds,
      },
      opts: {
        priority: prioritized ? 1 : undefined,
      },
    });
  }

  await queue.addBulk(jobs);
};
