import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { syncArweave } from "@/arweave-sync/index";
import { logger } from "@/common/logger";
import { arweaveGateway } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "arweave-sync-realtime";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    // In order to be as lean as possible, leave retrying
    // any failed processes to be done by subsequent jobs
    removeOnComplete: true,
    removeOnFail: true,
    timeout: 120000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      try {
        let localBlock = Number(await redis.get(`${QUEUE_NAME}-last-block`));
        if (localBlock === 0) {
          localBlock = (await arweaveGateway.blocks.getCurrent()).height;
          await redis.set(`${QUEUE_NAME}-last-block`, localBlock);
        } else {
          localBlock++;
        }

        let { lastBlock, lastCursor, done } = await syncArweave({
          fromBlock: localBlock,
        });
        while (!done) {
          ({ lastBlock, lastCursor, done } = await syncArweave({
            fromBlock: localBlock,
            afterCursor: lastCursor,
          }));
        }

        if (lastBlock) {
          await redis.set(`${QUEUE_NAME}-last-block`, lastBlock);
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Arweave realtime syncing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
