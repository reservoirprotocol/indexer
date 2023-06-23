import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { saveCollectionMint } from "@/orderbook/mints";
import { detectCollectionMint } from "@/orderbook/mints/calldata/detector";

const QUEUE_NAME = "mints-process";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 1000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { txHash } = job.data as Mint;

      try {
        const collectionMint = await detectCollectionMint(txHash);
        if (collectionMint) {
          const result = await saveCollectionMint(collectionMint);
          logger.info("mints-process", JSON.stringify({ success: result, collectionMint }));
        } else {
          logger.info("mints-process", JSON.stringify({ success: false, txHash }));
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        logger.error(
          QUEUE_NAME,
          `Failed to process mint ${JSON.stringify(job.data)}: ${error} (${error.stack})`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 30 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type Mint = {
  txHash: string;
};

export const addToQueue = async (mints: Mint[]) =>
  queue.addBulk(
    mints.map((mint) => ({
      name: mint.txHash,
      data: mint,
      opts: {
        // Deterministic job id so that we don't perform duplicated work
        jobId: mint.txHash,
      },
    }))
  );
