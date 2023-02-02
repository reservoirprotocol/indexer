import { Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

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
  worker = new Worker(
    QUEUE_NAME,
    async () => {
      logger.info(QUEUE_NAME, "Invalidating expired orders");

      const expiredOrders: { id: string }[] = await idb.manyOrNone(
        `
          WITH x AS (
            SELECT
              orders.id,
              upper(orders.valid_between) AS expiration
            FROM orders
            WHERE upper(orders.valid_between) < now()
              AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            LIMIT 2000
          )
          UPDATE orders SET
            fillability_status = 'expired',
            expiration = x.expiration,
            updated_at = now()
          FROM x
          WHERE orders.id = x.id
          RETURNING orders.id
        `
      );
      logger.info(QUEUE_NAME, `Invalidated ${expiredOrders.length} orders`);

      const currentTime = now();
      await orderUpdatesById.addToQueue(
        expiredOrders.map(
          ({ id }) =>
            ({
              context: `expired-orders-check-${currentTime}-${id}`,
              id,
              trigger: { kind: "expiry" },
            } as orderUpdatesById.OrderInfo)
        )
      );
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  const addToQueue = async () => queue.add(QUEUE_NAME, {});
  cron.schedule(
    // Every 5 seconds
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(["expired-orders-check-lock"], (5 - 3) * 1000)
        .then(async () => {
          logger.info(QUEUE_NAME, "Triggering expired orders check");
          await addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
