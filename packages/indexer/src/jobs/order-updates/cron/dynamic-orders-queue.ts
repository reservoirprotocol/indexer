import * as Sdk from "@reservoir0x/sdk";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import _ from "lodash";
import cron from "node-cron";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { fromBuffer, now } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import { getUSDAndNativePrices } from "@/utils/prices";

const QUEUE_NAME = "dynamic-orders";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 1,
    backoff: {
      type: "exponential",
      delay: 10000,
    },
    removeOnComplete: 10,
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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dynamicOrders: { id: string; kind: string; currency: Buffer; raw_data: any }[] =
          await idb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                orders.currency,
                orders.raw_data
              FROM orders
              WHERE orders.dynamic
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                ${continuation ? "AND orders.id > $/continuation/" : ""}
              ORDER BY orders.id
              LIMIT ${limit}
            `,
            { continuation }
          );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const values: any[] = [];
        for (const { id, kind, currency, raw_data } of dynamicOrders) {
          if (
            !_.isNull(raw_data) &&
            ["alienswap", "seaport", "seaport-v1.4", "seaport-v1.5"].includes(kind)
          ) {
            const order = new Sdk.SeaportV11.Order(config.chainId, raw_data);
            const newCurrencyPrice = order.getMatchingPrice().toString();

            const prices = await getUSDAndNativePrices(
              fromBuffer(currency),
              newCurrencyPrice,
              now()
            );
            if (prices.nativePrice) {
              values.push({
                id,
                price: prices.nativePrice,
                currency_price: newCurrencyPrice,
                // TODO: We should have a generic method for deriving the `value` from `price`
                value: prices.nativePrice,
                currency_value: newCurrencyPrice,
              });
            }
          }
        }

        const columns = new pgp.helpers.ColumnSet(
          [
            "?id",
            { name: "price", cast: "numeric(78, 0)" },
            { name: "currency_price", cast: "numeric(78, 0)" },
            { name: "value", cast: "numeric(78, 0)" },
            { name: "currency_value", cast: "numeric(78, 0) " },
            { name: "updated_at", mod: ":raw", init: () => "now()" },
          ],
          {
            table: "orders",
          }
        );
        if (values.length) {
          await idb.none(pgp.helpers.update(values, columns) + " WHERE t.id = v.id");
        }

        const currentTime = now();
        await orderUpdatesById.addToQueue(
          dynamicOrders.map(
            ({ id }) =>
              ({
                context: `dynamic-orders-update-${currentTime}-${id}`,
                id,
                trigger: { kind: "reprice" },
              } as orderUpdatesById.OrderInfo)
          )
        );

        if (dynamicOrders.length >= limit) {
          await addToQueue(dynamicOrders[dynamicOrders.length - 1].id);
        }
      } catch (error) {
        logger.error(QUEUE_NAME, `Failed to handle dynamic orders: ${error}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });

  const addToQueue = async (continuation?: string) => queue.add(QUEUE_NAME, { continuation });
  cron.schedule(
    // Every 10 minutes
    "*/10 * * * *",
    async () =>
      await redlock
        .acquire(["dynamic-orders-update-lock"], (10 * 60 - 3) * 1000)
        .then(async () => {
          logger.info(QUEUE_NAME, "Triggering dynamic orders update");
          await addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
