import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "events-sync-ft-transfers-write";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 15,
    backoff: {
      type: "fixed",
      delay: 10000,
    },
    removeOnComplete: 5,
    removeOnFail: 20000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && (config.chainId === 56 ? config.doFtTransfersWrite : true)) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { query } = job.data;

      try {
        await edb.none(query);
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed flushing ft transfer events to the database: ${error}`);
        throw error;
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 5,
    }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (query: string) => {
  await queue.add(randomUUID(), { query });
};
