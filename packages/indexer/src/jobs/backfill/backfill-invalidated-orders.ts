/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

const QUEUE_NAME = "backfill-invalidated-orders";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100000,
    removeOnFail: 10000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { orderId } = job.data;

      const limit = 20;
      const disabledOrders: { id: string }[] = await idb.manyOrNone(
        `
          SELECT
            orders.id
          FROM orders
          WHERE orders.updated_at >= to_timestamp(1682632800::double precision)
            AND orders.updated_at <= to_timestamp(1682950998::double precision)
            AND approval_status = 'disabled'::order_approval_status_t
            AND orders.id > $/orderId/
          LIMIT ${limit}
        `,
        { orderId, limit }
      );

      // Simulate
      await Promise.all(
        disabledOrders.map(({ id }) =>
          inject({
            method: "POST",
            url: `/management/orders/simulate/v1`,
            headers: {
              "Content-Type": "application/json",
            },
            payload: {
              id,
            },
          }).catch(() => {
            // Skip errors
          })
        )
      );

      if (disabledOrders.length >= limit) {
        await addToQueue(disabledOrders[disabledOrders.length - 1].id);
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (orderId: string) =>
  queue.add(randomUUID(), { orderId }, { jobId: orderId });
