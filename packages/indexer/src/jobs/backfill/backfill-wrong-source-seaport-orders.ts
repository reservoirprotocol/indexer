/* eslint-disable @typescript-eslint/no-explicit-any */

import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";

const QUEUE_NAME = "backfill-wrong-source-seaport-orders";

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
      const { orderId } = job.data;
      const limit = 1000;

      // There was a period of time when we didn't properly set the source for OpenSea orders
      const results = await idb.manyOrNone(
        `
          SELECT
            orders.id,
            orders.source_id_int
          FROM orders
          WHERE orders.id < $/orderId/
            AND orders.created_at > to_timestamp(1660000000)
            AND orders.created_at < to_timestamp(1661000000)
            AND orders.kind = 'seaport'
            AND orders.source_id_int IS NULL
            AND orders.contract IS NOT NULL
          ORDER BY orders.id DESC
          LIMIT $/limit/
        `,
        {
          limit,
          orderId,
        }
      );

      const sources = await Sources.getInstance();

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(["id", "source_id_int"], {
        table: "orders",
      });
      for (const { id, source_id_int } of results) {
        if (!source_id_int) {
          values.push({
            id,
            source_id_int: sources.getByDomain("opensea.io")!.id,
          });
        }
      }

      if (values.length) {
        await idb.none(
          `
            UPDATE orders SET
              source_id_int = x.source_id_int::INT,
              updated_at = now()
            FROM (
              VALUES ${pgp.helpers.values(values, columns)}
            ) AS x(id, source_id_int)
            WHERE orders.id = x.id::TEXT
          `
        );
      }

      if (results.length >= limit) {
        const lastResult = results[results.length - 1];
        await addToQueue(lastResult.id);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export const addToQueue = async (orderId: string) => {
  await queue.add(randomUUID(), { orderId });
};
