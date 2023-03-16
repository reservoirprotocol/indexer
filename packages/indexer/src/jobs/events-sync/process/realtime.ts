import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import { EventsBatch, processEventsBatch } from "@/events-sync/handlers";
import cron from "node-cron";
import _ from "lodash";

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
if (
  config.doBackgroundWork &&
  (_.includes([137, 42161, 10], config.chainId) ? config.doProcessRealtime : true)
) {
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

  // Every minute we check the size of the queue. This will
  // ensure we get notified when it's buffering up and potentially
  // blocking the real-time flow of orders.
  cron.schedule(
    "*/1 * * * *",
    async () =>
      await redlock
        .acquire(["realtime-process-size-check-lock"], (60 - 5) * 1000)
        .then(async () => {
          const size = await queue.count();
          if (size >= 40000) {
            logger.error(
              "realtime-process-size-check",
              `Realtime process buffering up: size=${size}`
            );
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}

export const addToQueue = async (batches: EventsBatch[], prioritized?: boolean) =>
  queue.addBulk(
    batches.map((batch) => ({
      name: batch.id,
      data: { batch },
      opts: { priority: prioritized ? 1 : undefined },
    }))
  );
