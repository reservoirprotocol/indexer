import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { checkForOrphanedBlock, syncEvents } from "@/events-sync/syncEventsV2";

const QUEUE_NAME = "events-sync-realtime-v2";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // In order to be as lean as possible, leave retrying
    // any failed processes to be done by subsequent jobs

    attempts: 30,
    backoff: {
      type: "fixed",
      delay: 100,
    },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && config.enableRealtimeProcessing) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      try {
        const { block } = job.data as { block: number };
        // lets set the latest block to the block we are syncing if it is higher than the current latest block by 1. If it is higher than 1, we create a job to sync the missing blocks
        // if its lower than the current latest block, we dont update the latest block in redis, but we still sync the block (this is for when we are catching up on missed blocks, or when we are syncing a block that is older than the current latest block)
        const latestBlock = await redis.get("latest-block-realtime");
        if (latestBlock) {
          const latestBlockNumber = Number(latestBlock);
          if (block > latestBlockNumber) {
            await redis.set("latest-block-realtime", block);
            if (block - latestBlockNumber > 1) {
              // if we are missing more than 1 block, we need to sync the missing blocks
              for (let i = latestBlockNumber + 1; i < block; i++) {
                logger.info("sync-events-v2", `Found missing block: ${i}`);
                await addToQueue({ block: i });
              }
            }
          }
        } else {
          await redis.set("latest-block-realtime", block);
        }

        await syncEvents(block);
        await checkForOrphanedBlock(block);
      } catch (error) {
        logger.warn(QUEUE_NAME, `Events realtime syncing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("error", (error) => {
    logger.warn(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async ({ block }: { block: number }) => {
  await queue.add(randomUUID(), { block });
};
