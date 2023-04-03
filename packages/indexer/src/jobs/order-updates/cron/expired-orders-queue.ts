import { Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";
import cron from "node-cron";

import { hdb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
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

// BACKGROUND WORKER AND MASTER ONLY
if (config.doBackgroundWork && config.master) {
  const intervalInSeconds = 5;

  worker = new Worker(
    QUEUE_NAME,
    async () => {
      logger.info(QUEUE_NAME, "Invalidating expired orders");

      // Update the expired orders second by second
      const currentTime = now();
      await backfillExpiredOrders.addToQueue(
        _.range(0, intervalInSeconds).map((s) => currentTime - s)
      );

      // As a safety mechanism, update any left expired orders

      // Use `hdb` for lower timeouts (to avoid long-running queries which can result in deadlocks)
      const expiredOrders: { id: string }[] = await hdb.manyOrNone(
        `
          WITH x AS (
            SELECT
              orders.id,
              upper(orders.valid_between) AS expiration
            FROM orders
            WHERE upper(orders.valid_between) < now()
              AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            LIMIT 5000
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
