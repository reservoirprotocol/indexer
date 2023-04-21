import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { ArchiveBidEvents } from "@/jobs/data-archive/archive-bid-events";
const QUEUE_NAME = "process-archive-data-queue";

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
          if (await acquireLock(getLockName(tableName), 60 * 5 - 5)) {
            job.data.lock = true;

            try {
              await ArchiveBidEvents.archive();
            } catch (error) {
              logger.error(QUEUE_NAME, `Bid events archive errored: ${error}`);
            }
          }
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
          await releaseLock(getLockName(tableName)); // Release the lock

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
