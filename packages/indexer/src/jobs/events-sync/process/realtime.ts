import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { EventsBatch, processEventsBatch } from "@/events-sync/handlers";

const QUEUE_NAME = "events-sync-process-realtime";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 100,
    removeOnFail: 10000,
    timeout: 120000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate(), maxStalledCount: 10 });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork && (config.chainId === 137 ? config.doProcessRealtime : true)) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { batch } = job.data as { batch: EventsBatch };

      try {
        if (batch) {
          await processEventsBatch(batch);
        } else {
          await processEventsBatch({
            id: randomUUID(),
            events: [
              {
                kind: job.data.kind,
                data: job.data.events,
              },
            ],
            backfill: job.data.backfill,
          });
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Events processing failed: ${error}`);
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 20 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (batches: EventsBatch[]) =>
  queue.addBulk(
    batches.map((batch) => ({
      name: batch.id,
      data: { batch },
    }))
  );
