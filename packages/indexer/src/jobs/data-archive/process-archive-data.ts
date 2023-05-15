import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { ArchiveBidEvents } from "@/jobs/data-archive/archive-classes/archive-bid-events";
import { ArchiveBidOrders } from "@/jobs/data-archive/archive-classes/archive-bid-orders";
import { ArchiveManager } from "@/jobs/data-archive/archive-manager";
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
      const { tableName, type, nextBatchTime } = job.data;

      switch (tableName) {
        case "bid_events":
          // Archive bid events
          if (await acquireLock(getLockName(tableName), 60 * 10 - 5)) {
            job.data.lock = true;

            try {
              const archiveBidEvents = new ArchiveBidEvents();
              await ArchiveManager.archive(archiveBidEvents);
            } catch (error) {
              logger.error(QUEUE_NAME, `Bid events archive errored: ${error}`);
            }
          }
          break;

        case "orders":
          // Archive bid events
          if (
            type === "bids" &&
            (await acquireLock(getLockName(`${tableName}${nextBatchTime}`), 60 * 10 - 5))
          ) {
            job.data.lock = true;

            try {
              const archiveBidOrders = new ArchiveBidOrders();
              await ArchiveManager.archive(archiveBidOrders, nextBatchTime);
            } catch (error) {
              logger.error(QUEUE_NAME, `Bid orders archive errored: ${error}`);
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
    const { tableName, lock, type, nextBatchTime } = job.data;

    if (lock) {
      switch (tableName) {
        case "bid_events":
          {
            await releaseLock(getLockName(tableName)); // Release the lock

            // Check if archiving should continue
            const archiveBidEvents = new ArchiveBidEvents();
            if (await archiveBidEvents.continueArchive()) {
              await addToQueue(tableName);
            }
          }

          break;

        case "orders": {
          if (type === "bids") {
            await releaseLock(getLockName(`${tableName}${nextBatchTime}`)); // Release the lock

            // Check if archiving should continue
            const archiveBidOrders = new ArchiveBidOrders();
            if (!nextBatchTime && (await archiveBidOrders.continueArchive())) {
              await addToQueue(tableName, type);
            }
          }
          break;
        }
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

export const addToQueue = async (
  tableName: string,
  type = "",
  nextBatchTime: string | null = null
) => {
  await queue.add(randomUUID(), { tableName, type, nextBatchTime });
};
