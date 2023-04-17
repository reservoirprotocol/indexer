import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import { ArchiveBidEvents } from "@/jobs/data-archive/archive-bid-events";
const QUEUE_NAME = "archive-data-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 50000,
    backoff: {
      type: "fixed",
      delay: 5000,
    },
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { tableName } = job.data;

      switch (tableName) {
        case "bid_events":
          // Archive bid events
          await redlock
            .acquire([getLockName(tableName)], (5 * 60 - 5) * 1000)
            .then(async (lock) => {
              job.data.lock = lock;
              await ArchiveBidEvents.archive();
            })
            .catch(() => {
              // Skip on any errors
            });
          break;
      }
    },
    {
      connection: redis.duplicate(),
      concurrency: 1,
    }
  );

  worker.on("completed", async (job) => {
    const { tableName, lock } = job.data;

    if (lock) {
      switch (tableName) {
        case "bid_events":
          await redlock.release(lock); // Release the lock

          // Check if archiving should continue
          if (await ArchiveBidEvents.continueArchive()) {
            await addToQueue(tableName);
          }
          break;
      }
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

function getLockName(tableName: string) {
  return `${tableName}-archive-cron-lock`;
}

export const addToQueue = async (tableName: string) => {
  await queue.add(randomUUID(), { tableName });
};
