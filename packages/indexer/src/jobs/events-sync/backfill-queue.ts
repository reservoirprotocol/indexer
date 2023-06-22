import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import * as historicalEventsSync from "@/jobs/events-sync/historical-queue";
import { randomUUID } from "crypto";

const QUEUE_NAME = "events-sync-backfill";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
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

// BACKGROUND WORKER AND EVENT SYNC BACKFILLER ONLY
if (config.doBackgroundWork && config.doEventsSyncBackfill) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const blockSyncRange = job.data as { fromBlock: number; toBlock: number };

      let startBlock = blockSyncRange.fromBlock;
      const latestBlock = await redis.get("latest-block-backfill");
      const blockAddToQueueBatchSize = await redis.get("block-add-to-queue-batch-size");
      if (!latestBlock || !blockAddToQueueBatchSize) {
        throw new Error("Missing latest block or block add to queue batch size");
      }

      const blocksPerBatch = parseInt(blockAddToQueueBatchSize);

      // check if the block difference is = to the batch size
      // if so, we can assume that the queue is empty
      // and we can add the entire range to the queue
      if (parseInt(latestBlock) - startBlock === 0) {
        // add next batch range to queue
        startBlock = startBlock + blocksPerBatch;
        for (let i = startBlock; i <= startBlock + blocksPerBatch; i++) {
          await historicalEventsSync.addToQueue({ block: i });
        }
      } else {
        await addToQueue(startBlock, blockSyncRange.toBlock);
      }
    },
    { connection: redis.duplicate(), concurrency: 5 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (fromBlock: number, toBlock: number) => {
  await queue.add(randomUUID(), { fromBlock, toBlock });
};
