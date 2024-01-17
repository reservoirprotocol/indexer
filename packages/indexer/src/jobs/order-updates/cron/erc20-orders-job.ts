import cron from "node-cron";

import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { fromBuffer, now } from "@/common/utils";
import { config } from "@/config/index";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";
import { getUSDAndNativePrices, USDAndNativePrices } from "@/utils/prices";
import pgPromise from "pg-promise";

export type OrderUpdatesErc20OrderJobPayload = {
  continuation?: string;
};

export default class OrderUpdatesErc20OrderJob extends AbstractRabbitMqJobHandler {
  queueName = "erc20-orders";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;
  useSharedChannel = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: OrderUpdatesErc20OrderJobPayload) {
    const { continuation } = payload;

    logger.info(
      `erc20-orders-update`,
      JSON.stringify({
        message: `Start. continuation=${continuation}`,
      })
    );

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
          currentTime,
          {
            nonZeroCommunityTokens: true,
          }
        );

        const dataForValue = await getUSDAndNativePrices(
          convertedCurrency,
          currency_value,
          currentTime,
          {
            nonZeroCommunityTokens: true,
          }
        );

        let dataForNormalizedValue: USDAndNativePrices | undefined;
        if (currency_normalized_value) {
          dataForNormalizedValue = await getUSDAndNativePrices(
            convertedCurrency,
            currency_normalized_value,
            currentTime,
            {
              nonZeroCommunityTokens: true,
            }
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

      let updatedOrderIds = erc20Orders.map(({ id }) => id);

      if (values.length) {
        try {
          const updateQuery =
            pgp.helpers.update(values, columns) +
            " WHERE t.id = v.id AND (" +
            "t.price IS DISTINCT FROM v.price " +
            "OR t.value IS DISTINCT FROM v.value " +
            "OR t.normalized_value IS DISTINCT FROM v.normalized_value" +
            ") RETURNING t.id";

          const updatedOrders = await idb.manyOrNone(updateQuery);

          updatedOrderIds = updatedOrders.map(({ id }) => id);

          logger.info(
            `erc20-orders-update`,
            JSON.stringify({
              message: `Updated erc20 orders.`,
              values,
              updatedOrderIds,
              updateQuery: pgPromise.as.format(updateQuery),
            })
          );
        } catch (error) {
          logger.error(
            `erc20-orders-update`,
            JSON.stringify({
              message: `Failed to update erc20 orders: ${error}`,
              values,
              error,
            })
          );

          await idb.none(pgp.helpers.update(values, columns) + " WHERE t.id = v.id");
        }
      }

      if (updatedOrderIds.length) {
        await orderUpdatesByIdJob.addToQueue(
          erc20Orders.map(
            ({ id }) =>
              ({
                context: `erc20-orders-update-${now}-${id}`,
                id,
                trigger: { kind: "reprice" },
              } as OrderUpdatesByIdJobPayload)
          )
        );
      }

      if (erc20Orders.length >= limit) {
        await this.addToQueue(
          erc20Orders[erc20Orders.length - 1].id,
          config.chainId === 137 ? 30000 : 1000
        );
      }
    } catch (error) {
      logger.error(`erc20-orders-update`, `Failed to handle erc20 orders: ${error}`);
    }
  }

  public async addToQueue(continuation?: string, delay = 0) {
    await this.send({ payload: { continuation } }, delay);
  }
}

export const orderUpdatesErc20OrderJob = new OrderUpdatesErc20OrderJob();

if (config.doBackgroundWork) {
  cron.schedule(
    // Every 1 day (the frequency should match the granularity of the price data)
    "0 0 1 * * *",
    async () =>
      await redlock
        .acquire(["erc20-orders-update-lock"], (10 * 60 - 3) * 1000)
        .then(async () => {
          logger.info(orderUpdatesErc20OrderJob.queueName, "Triggering ERC20 orders update");
          await orderUpdatesErc20OrderJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
