import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import cron from "node-cron";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, now } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import { USDAndNativePrices, getUSDAndNativePrices } from "@/utils/prices";

const QUEUE_NAME = "erc20-orders";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 5000,
  },
});
export let worker: Worker | undefined;

new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { continuation } = job.data as { continuation?: string };

      try {
        const limit = 500;

        const erc20Orders: {
          id: string;
          currency: Buffer;
          currency_price: string;
          currency_value: string;
          currency_normalized_value?: string;
        }[] = await idb.manyOrNone(
          `
            SELECT
              orders.id,
              orders.currency,
              orders.currency_price,
              orders.currency_value,
              orders.currency_normalized_value
            FROM orders
            WHERE orders.needs_conversion
              AND orders.fillability_status = 'fillable'
              AND orders.approval_status = 'approved'
              ${continuation ? "AND orders.id > $/continuation/" : ""}
            ORDER BY orders.id
            LIMIT ${limit}
          `,
          { continuation }
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const values: any[] = [];

        const currentTime = now();
        for (const {
          id,
          currency,
          currency_price,
          currency_value,
          currency_normalized_value,
        } of erc20Orders) {
          const convertedCurrency = fromBuffer(currency);

          const dataForPrice = await getUSDAndNativePrices(
            convertedCurrency,
            currency_price,
            currentTime
          );
          const dataForValue = await getUSDAndNativePrices(
            convertedCurrency,
            currency_value,
            currentTime
          );

          let dataForNormalizedValue: USDAndNativePrices | undefined;
          if (currency_normalized_value) {
            dataForNormalizedValue = await getUSDAndNativePrices(
              convertedCurrency,
              currency_normalized_value,
              currentTime
            );
          }

          if (dataForPrice.nativePrice && dataForValue.nativePrice) {
            values.push({
              id,
              price: dataForPrice.nativePrice,
              value: dataForValue.nativePrice,
              normalized_value: dataForNormalizedValue?.nativePrice ?? null,
            });
          }
        }

        const columns = new pgp.helpers.ColumnSet(
          [
            "?id",
            { name: "price", cast: "numeric(78, 0)" },
            { name: "value", cast: "numeric(78, 0)" },
            { name: "normalized_value", cast: "numeric(78, 0)" },
            { name: "updated_at", mod: ":raw", init: () => "now()" },
          ],
          {
            table: "orders",
          }
        );
        if (values.length) {
          await idb.none(pgp.helpers.update(values, columns) + " WHERE t.id = v.id");
        }

        await orderUpdatesById.addToQueue(
          erc20Orders.map(
            ({ id }) =>
              ({
                context: `erc20-orders-update-${now}-${id}`,
                id,
                trigger: { kind: "reprice" },
              } as orderUpdatesById.OrderInfo)
          )
        );

        if (erc20Orders.length >= limit) {
          await addToQueue(erc20Orders[erc20Orders.length - 1].id);
        }
      } catch (error) {
        logger.error(`dynamic-orders-update`, `Failed to handle dynamic orders: ${error}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  const addToQueue = async (continuation?: string) => queue.add(QUEUE_NAME, { continuation });
  cron.schedule(
    // Every 1 day (the frequency should match the granularity of the price data)
    "0 0 1 * * *",
    async () =>
      await redlock
        .acquire(["erc20-orders-update-lock"], (10 * 60 - 3) * 1000)
        .then(async () => {
          logger.info(QUEUE_NAME, "Triggering ERC20 orders update");
          await addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
