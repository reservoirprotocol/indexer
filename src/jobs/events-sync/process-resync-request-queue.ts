import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { EventDataKind } from "@/events-sync/data";
import * as eventsSyncBackfill from "@/jobs/events-sync/backfill-queue";

const QUEUE_NAME = "process-resync-request";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 5,
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
      const { fromBlock, toBlock, backfill, syncDetails, blocksPerBatch } = job.data;

      await eventsSyncBackfill.addToQueue(fromBlock, toBlock, {
        backfill,
        syncDetails,
        blocksPerBatch,
      });
    },
    { connection: redis.duplicate(), concurrency: 15 }
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
          events: EventDataKind[];
        }
      | {
          method: "address";
          address: string;
        };
  }
) => {
  const prioritized = options?.prioritized ?? false;
  const jobId = options?.attempts
    ? `${fromBlock}-${toBlock}-${options.attempts}`
    : `${fromBlock}-${toBlock}`;

  await queue.add(
    `${fromBlock}-${toBlock}`,
    {
      fromBlock: fromBlock,
      toBlock: toBlock,
      backfill: options?.backfill,
      syncDetails: options?.syncDetails,
      blocksPerBatch: options?.blocksPerBatch,
    },
    {
      priority: prioritized ? 1 : undefined,
      jobId,
      delay: options?.delay,
      attempts: options?.attempts,
    }
  );
};
