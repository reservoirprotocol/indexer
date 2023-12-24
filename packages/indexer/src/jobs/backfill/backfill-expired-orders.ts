/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

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

      if (expiredOrders.length) {
        logger.info(QUEUE_NAME, `Invalidated ${expiredOrders.length} orders`);
      }

      const currentTime = now();
      await orderUpdatesByIdJob.addToQueue(
        expiredOrders.map(
          ({ id }) =>
            ({
              context: `expired-orders-check-${currentTime}-${id}`,
              id,
              trigger: { kind: "expiry" },
            } as OrderUpdatesByIdJobPayload)
        )
      );
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (timestamps: number[]) =>
  queue.addBulk(
    timestamps.map((timestamp) => ({
      name: randomUUID(),
      data: { timestamp },
      options: { jobId: timestamp.toString() },
    }))
  );
