/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

const QUEUE_NAME = "backfill-cancel-seaport-v11-orders";

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
      const { side, id, createdAt } = job.data;
      const limit = 1000;

      const results = await idb.manyOrNone(
        `
          SELECT
            orders.id,
            orders.kind,
            orders.conduit,
            orders.created_at
          FROM orders
          WHERE orders.side = $/side/
            AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            AND (orders.created_at, orders.id) < ($/createdAt/, $/id/)
          ORDER BY
            orders.created_at DESC,
            orders.id DESC
          LIMIT $/limit/
        `,
        {
          side,
          createdAt,
          id,
          limit,
        }
      );

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(["id", "fillability_status"], {
        table: "orders",
      });
      for (const r of results) {
        if (
          r.kind === "seaport-v1.4" &&
          fromBuffer(r.conduit) === "0x1e0049783f008a0085193e00003d00cd54003c71"
        ) {
          values.push({
            id: r.id,
            fillability_status: "cancelled",
          });
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE orders SET
              fillability_status = x.fillability_status::order_fillability_status_t,
              updated_at = now()
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(id, fillability_status)
            WHERE orders.id = x.id::TEXT
          `
        );

        await orderUpdatesByIdJob.addToQueue(
          values.map(
            ({ id }) =>
              ({
                context: `cancelled-${id}`,
                id,
                trigger: {
                  kind: "cancel",
                },
              } as OrderUpdatesByIdJobPayload)
          )
        );
      }

      if (results.length >= limit) {
        const lastResult = results[results.length - 1];
        await addToQueue(side, lastResult.created_at, lastResult.id);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // redlock
  //   .acquire([`${QUEUE_NAME}-lock-7`], 60 * 60 * 24 * 30 * 1000)
  //   .then(async () => {
  //     await addToQueue("sell", new Date().toISOString(), HashZero);
  //     await addToQueue("buy", new Date().toISOString(), HashZero);
  //   })
  //   .catch(() => {
  //     // Skip on any errors
  //   });
}

export const addToQueue = async (side: string, createdAt: string, id: string) => {
  await queue.add(randomUUID(), { side, id, createdAt }, { jobId: `${side}-${createdAt}-${id}-7` });
};
