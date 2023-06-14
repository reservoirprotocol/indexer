import { Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "expired-mints";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 5,
    removeOnFail: 5,
    timeout: 5000,
  },
});
export let worker: Worker | undefined;

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const intervalInSeconds = 60;

  worker = new Worker(
    QUEUE_NAME,
    async () => {
      logger.info(QUEUE_NAME, "Invalidating expired mints");

      await idb.none(
        `
          UPDATE collection_mints SET
            status = 'closed'
          WHERE collection_mints.end_time <= now()
            AND collection_mints.status = 'open'
        `
      );
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  const addToQueue = async () => queue.add(QUEUE_NAME, {});
  cron.schedule(
    `*/${intervalInSeconds} * * * * *`,
    async () =>
      await redlock
        .acquire(["expired-mints-check-lock"], (intervalInSeconds - 3) * 1000)
        .then(async () => {
          logger.info(QUEUE_NAME, "Triggering expired mints check");
          await addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
