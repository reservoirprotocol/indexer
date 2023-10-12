/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Sdk from "@reservoir0x/sdk";
import { Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";

const QUEUE_NAME = "backfill-foundation-orders";

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
    async () => {
      const results = await idb.manyOrNone(
        `
          SELECT
            orders.id,
            orders.raw_data
          FROM orders
          WHERE orders.kind = 'foundation'
            AND orders.contract IS NOT NULL
            AND orders.fillability_status = 'no-balance'
        `
      );

      const values: any[] = [];
      const columns = new pgp.helpers.ColumnSet(["id", "fillability_status"], {
        table: "orders",
      });

      const exchange = new Sdk.Foundation.Exchange(config.chainId);
      const contract = exchange.contract.connect(baseProvider);
      await Promise.all(
        results.map(async (r) => {
          try {
            const order_raw_data = r.raw_data;
            const onchainState = await contract.getBuyPrice(
              order_raw_data.contract,
              order_raw_data.tokenId
            );
            if (
              order_raw_data.maker == onchainState.seller.toLowerCase() &&
              order_raw_data.price == onchainState.price.toString()
            ) {
              values.push({
                id: r.id,
                fillability_status: "fillable",
              });
            }
          } catch {
            // Skip errors
          }
        })
      );

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
          values.map(({ id }) => ({
            context: `fix-foundation-orders-${id}`,
            id,
            trigger: { kind: "revalidation" },
          }))
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  // if (config.chainId === 1) {
  //   redlock
  //     .acquire([`${QUEUE_NAME}-lock-8`], 60 * 60 * 24 * 30 * 1000)
  //     .then(async () => {
  //       await addToQueue();
  //     })
  //     .catch(() => {
  //       // Skip on any errors
  //     });
  // }
}

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};
