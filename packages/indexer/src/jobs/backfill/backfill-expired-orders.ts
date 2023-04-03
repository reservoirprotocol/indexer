/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

const QUEUE_NAME = "backfill-expired-orders";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 1000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { timestamp } = job.data;

      const expiredOrders: { id: string }[] = await idb.manyOrNone(
        `
          WITH x AS (
            SELECT
              orders.id,
              upper(orders.valid_between) AS expiration
            FROM orders
            WHERE upper(orders.valid_between) = to_timestamp($/timestamp/)
              AND upper(orders.valid_between) < now()
              AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
          )
          UPDATE orders SET
            fillability_status = 'expired',
            expiration = x.expiration,
            updated_at = now()
          FROM x
          WHERE orders.id = x.id
          RETURNING orders.id
        `,
        { timestamp }
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

      if (timestamp < 1680567720) {
        await addToQueue(timestamp + 1);
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock-3`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      await addToQueue(1680527026 + 500);
      await addToQueue(1680527026 + 1000);
      await addToQueue(1680527026 + 1500);
      await addToQueue(1680527026 + 2000);
      await addToQueue(1680527026 + 2500);
      await addToQueue(1680527026 + 3000);
      await addToQueue(1680527026 + 3500);
      await addToQueue(1680527026 + 4500);
      await addToQueue(1680527026 + 5000);
      await addToQueue(1680527026 + 5500);
      await addToQueue(1680527026 + 6000);
      await addToQueue(1680527026 + 6500);
      await addToQueue(1680527026 + 7000);
      await addToQueue(1680527026 + 7500);
      await addToQueue(1680527026 + 8500);
      await addToQueue(1680527026 + 9000);
      await addToQueue(1680527026 + 9500);
      await addToQueue(1680527026 + 10000);
      await addToQueue(1680527026 + 11000);
      await addToQueue(1680527026 + 12000);
      await addToQueue(1680527026 + 13000);
      await addToQueue(1680527026 + 14000);
      await addToQueue(1680527026 + 15000);
      await addToQueue(1680527026 + 16000);
      await addToQueue(1680527026 + 17000);
      await addToQueue(1680527026 + 18000);
      await addToQueue(1680527026 + 19000);
      await addToQueue(1680527026 + 20000);
      await addToQueue(1680527026 + 21000);
      await addToQueue(1680527026 + 22000);
      await addToQueue(1680527026 + 23000);
      await addToQueue(1680527026 + 24000);
      await addToQueue(1680527026 + 25000);
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (timestamp: number) => {
  await queue.add(randomUUID(), { timestamp }, { jobId: timestamp.toString() });
};
