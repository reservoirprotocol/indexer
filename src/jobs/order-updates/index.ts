import * as Sdk from "@reservoir0x/sdk";
import cron from "node-cron";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { fromBuffer, now } from "@/common/utils";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import { getUSDAndNativePrices } from "@/utils/prices";
import _ from "lodash";

// Whenever an order changes its state (eg. a new order comes in,
// a fill/cancel happens, an order gets expired, or an order gets
// revalidated/invalidated due to a change in balance or approval
// we might want to take some actions (eg. update any caches). As
// for events syncing, we have two separate job queues. The first
// one is for handling direct order state changes (cancels, fills
// or expirations - where we know the exact id of the orders that
// are affected), while the other is for indirect change of state
// - where we don't know the exact ids of the affected orders and
// some additional processing is required (eg. on balance changes
// many of the orders of a maker might change their state).

import "@/jobs/order-updates/by-id-queue";
import "@/jobs/order-updates/by-maker-queue";
import "@/jobs/order-updates/by-maker-bundle-queue";

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  // Handle expired orders
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(["expired-orders-check-lock"], (5 - 3) * 1000)
        .then(async () => {
          logger.info("expired-orders-check", "Invalidating expired orders");

          try {
            const expiredOrders: { id: string }[] = await idb.manyOrNone(
              `
                WITH x AS (
                  SELECT
                    orders.id,
                    upper(orders.valid_between) AS expiration
                  FROM orders
                  WHERE upper(orders.valid_between) < now()
                    AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
                  LIMIT 2000
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
            logger.info("expired-orders-check", `Invalidated ${expiredOrders.length} orders`);

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
          } catch (error) {
            logger.error(`expired-orders-check`, `Failed to handle expired orders: ${error}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );

  // TODO: Move the below cron jobs to job queues so that deployments don't impact them

  // Handle dynamic orders
  cron.schedule(
    "*/10 * * * *",
    async () =>
      await redlock
        .acquire(["dynamic-orders-update-lock"], 10 * 60 * 1000)
        .then(async () => {
          logger.info(`dynamic-orders-update`, "Updating dynamic orders");

          try {
            let continuation: string | undefined;
            const limit = 500;

            let done = false;
            while (!done) {
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
                if (!_.isNull(raw_data) && kind === "seaport") {
                  const order = new Sdk.Seaport.Order(config.chainId, raw_data);
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
                  { name: "price", cast: "NUMERIC(78, 0)" },
                  { name: "currency_price", cast: "NUMERIC(78, 0)" },
                  { name: "value", cast: "NUMERIC(78, 0)" },
                  { name: "currency_value", cast: "NUMERIC(78, 0) " },
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
                continuation = dynamicOrders[dynamicOrders.length - 1].id;
              } else {
                done = true;
              }
            }
          } catch (error) {
            logger.error(`dynamic-orders-update`, `Failed to handle dynamic orders: ${error}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );

  // Handle ERC20 orders
  cron.schedule(
    // The cron frequency should match the granularity of the price data (eg. once per day for now)
    "0 0 1 * * *",
    async () =>
      await redlock
        .acquire(["erc20-orders-update-lock"], 10 * 60 * 1000)
        .then(async () => {
          logger.info(`erc20-orders-update`, "Updating ERC20 order prices");

          try {
            let continuation: string | undefined;
            const limit = 500;

            let done = false;
            while (!done) {
              const erc20Orders: {
                id: string;
                currency: Buffer;
                currency_price: string;
                currency_value: string;
              }[] = await idb.manyOrNone(
                `
                  SELECT
                    orders.id,
                    orders.currency,
                    orders.currency_price,
                    orders.currency_value
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
              for (const { id, currency, currency_price, currency_value } of erc20Orders) {
                const dataForPrice = await getUSDAndNativePrices(
                  fromBuffer(currency),
                  currency_price,
                  currentTime
                );
                const dataForValue = await getUSDAndNativePrices(
                  fromBuffer(currency),
                  currency_value,
                  currentTime
                );
                if (dataForPrice.nativePrice && dataForValue.nativePrice) {
                  values.push({
                    id,
                    price: dataForPrice.nativePrice,
                    value: dataForValue.nativePrice,
                  });
                }
              }

              const columns = new pgp.helpers.ColumnSet(
                [
                  "?id",
                  { name: "price", cast: "numeric(78, 0)" },
                  { name: "value", cast: "numeric(78, 0)" },
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
                continuation = erc20Orders[erc20Orders.length - 1].id;
              } else {
                done = true;
              }
            }
          } catch (error) {
            logger.error(`dynamic-orders-update`, `Failed to handle dynamic orders: ${error}`);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
