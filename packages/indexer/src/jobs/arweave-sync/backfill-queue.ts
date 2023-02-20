import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { syncArweave } from "@/arweave-sync/index";
import { logger } from "@/common/logger";
import { BullMQBulkJob, redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "arweave-sync-backfill";

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
      const { fromBlock, toBlock } = job.data;

      try {
        logger.info(QUEUE_NAME, `Arweave backfill syncing block range [${fromBlock}, ${toBlock}]`);

        let { lastCursor, done } = await syncArweave({ fromBlock, toBlock });
        while (!done) {
          ({ lastCursor, done } = await syncArweave({
            fromBlock,
            toBlock,
            afterCursor: lastCursor,
          }));
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Arweave backfill syncing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
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
  }
) => {
  // Syncing is done in several batches as for events syncing
  const blocksPerBatch = options?.blocksPerBatch ?? 4;

  // Sync in reverse to handle more recent events first
  const jobs: BullMQBulkJob[] = [];
  for (let to = toBlock; to >= fromBlock; to -= blocksPerBatch) {
    const from = Math.max(fromBlock, to - blocksPerBatch + 1);
    jobs.push({
      name: `${from}-${to}`,
      data: {
        fromBlock: from,
        toBlock: to,
      },
    });
  }

  await queue.addBulk(jobs);
};
