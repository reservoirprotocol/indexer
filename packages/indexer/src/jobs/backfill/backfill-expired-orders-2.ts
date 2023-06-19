/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

const QUEUE_NAME = "backfill-expired-orders-2";

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
      const { from, to } = job.data;

      const threshold = 10;
      const expiredOrders: { id: string }[] = await idb.manyOrNone(
        `
          WITH x AS (
            SELECT
              orders.id,
              upper(orders.valid_between) AS expiration
            FROM orders
            WHERE upper(orders.valid_between) >= to_timestamp($/timestamp/)
              AND upper(orders.valid_between) < to_timestamp($/timestamp/ + ${threshold})
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
        { timestamp: from }
      );

      if (expiredOrders.length) {
        logger.info(QUEUE_NAME, `Invalidated ${expiredOrders.length} orders`);
      }

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

      if (from + threshold <= to) {
        await addToQueue([{ from: from + threshold, to }]);
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  redlock
    .acquire([`${QUEUE_NAME}-lock-8`], 60 * 60 * 24 * 30 * 1000)
    .then(async () => {
      if (config.chainId === 1) {
        await addToQueue([{ from: 1685102411, to: now() }]);
      }
    })
    .catch(() => {
      // Skip on any errors
    });
}

export const addToQueue = async (timestamps: { from: number; to: number }[]) =>
  queue.addBulk(
    timestamps.map(({ from, to }) => ({
      name: randomUUID(),
      data: { from, to },
      options: { jobId: `${from}-${to}` },
    }))
  );
