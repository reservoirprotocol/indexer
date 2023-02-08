import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "events-sync-ft-transfers-write";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 5,
    removeOnFail: 20000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { query } = job.data;

      try {
        await idb.none(query);
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed flushing ft transfer events to the database: ${error}`);
        throw error;
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 3,
    }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (query: string) => {
  await queue.add(randomUUID(), { query });
};
