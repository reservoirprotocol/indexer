import { Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import * as backfillExpiredOrders from "@/jobs/backfill/backfill-expired-orders";

const QUEUE_NAME = "expired-orders";

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
  const intervalInSeconds = 5;

  worker = new Worker(
    QUEUE_NAME,
    async () => {
      logger.info(QUEUE_NAME, "Invalidating expired orders");

      const lastTimestampKey = "expired-orders-last-timestamp";
      const lastTimestamp = await redis.get(lastTimestampKey).then((t) => (t ? Number(t) : now()));

      // Update the expired orders second by second
      const currentTime = now();
      if (currentTime > lastTimestamp) {
        await backfillExpiredOrders.addToQueue(
          _.range(0, currentTime - lastTimestamp + 1).map((s) => currentTime - s)
        );
      }

      // Make sure to have some redundancy checks
      await redis.set(lastTimestampKey, currentTime - intervalInSeconds);
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
        .acquire(["expired-orders-check-lock"], (intervalInSeconds - 3) * 1000)
        .then(async () => {
          logger.info(QUEUE_NAME, "Triggering expired orders check");
          await addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
