import * as Sdk from "@reservoir0x/sdk";
import _ from "lodash";
import cron from "node-cron";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { redlock } from "@/common/redis";
import { fromBuffer, now } from "@/common/utils";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";
import { getUSDAndNativePrices } from "@/utils/prices";

export type OrderUpdatesDynamicOrderJobPayload = {
  continuation?: string;
};

export default class OrderUpdatesDynamicOrderJob extends AbstractRabbitMqJobHandler {
  queueName = "dynamic-orders";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;
  useSharedChannel = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  public async process(payload: OrderUpdatesDynamicOrderJobPayload) {
    const { continuation } = payload;

    try {
      const limit = 500;

      const dynamicOrders: {
        id: string;
        kind: string;
        side: string;
        currency: Buffer;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw_data: any;
        maker: Buffer;
        taker: Buffer;
        price: string;
        currency_price: string;
        value: string;
        currency_value: string;
      }[] = await idb.manyOrNone(
        `
          SELECT
            orders.id,
            orders.kind,
            orders.side,
            orders.currency,
            orders.raw_data,
            orders.maker,
            orders.taker,
            orders.price,
            orders.currency_price,
            orders.value,
            orders.currency_value
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
      const values: {
        id: string;
        price: string;
        currency_price: string;
        value: string;
        currency_value: string;
        dynamic: boolean;
      }[] = [];
      for (const {
        id,
        kind,
        side,
        currency,
        raw_data,
        maker,
        taker,
        price,
        currency_price,
        value,
        currency_value,
      } of dynamicOrders) {
        if (
          !_.isNull(raw_data) &&
          ["alienswap", "seaport", "seaport-v1.4", "seaport-v1.5"].includes(kind)
        ) {
          const order = new Sdk.SeaportV11.Order(config.chainId, raw_data);
          const newCurrencyPrice = order.getMatchingPrice().toString();

          const prices = await getUSDAndNativePrices(fromBuffer(currency), newCurrencyPrice, now());
          if (prices.nativePrice) {
            values.push({
              id,
              price: prices.nativePrice,
              currency_price: newCurrencyPrice,
              // TODO: We should have a generic method for deriving the `value` from `price`
              value: prices.nativePrice,
              currency_value: newCurrencyPrice,
              dynamic: true,
            });
          }
        } else if (kind === "nftx-v3") {
          try {
            const order = new Sdk.NftxV3.Order(
              config.chainId,
              fromBuffer(maker),
              fromBuffer(taker),
              raw_data
            );

            if (side === "sell") {
              const { price, premiumPrice } = await order.getPrice(baseProvider, config.nftxApiKey);

              logger.info(
                this.queueName,
                `Updating dynamic nftx-v3 order: ${JSON.stringify({
                  order,
                  price: price.toString(),
                  premiumPrice: premiumPrice.toString(),
                })}`
              );

              values.push({
                id,
                price: price.toString(),
                currency_price: price.toString(),
                value: price.toString(),
                currency_value: price.toString(),
                dynamic: side === "sell" && premiumPrice.gt(0),
              });
            } else {
              values.push({
                id,
                price,
                currency_price,
                value,
                currency_value,
                dynamic: false,
              });
            }
          } catch (error) {
            // Skip errors
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
          { name: "dynamic", cast: "boolean" },
        ],
        {
          table: "orders",
        }
      );
      if (values.length) {
        await idb.none(pgp.helpers.update(values, columns) + " WHERE t.id = v.id");
      }

      const currentTime = now();
      await orderUpdatesByIdJob.addToQueue(
        dynamicOrders.map(
          ({ id }) =>
            ({
              context: `dynamic-orders-update-${currentTime}-${id}`,
              id,
              trigger: { kind: "reprice" },
            } as OrderUpdatesByIdJobPayload)
        )
      );

      if (dynamicOrders.length >= limit) {
        await this.addToQueue(dynamicOrders[dynamicOrders.length - 1].id);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      logger.error(this.queueName, `Failed to handle dynamic orders: ${error} (${error.stack})`);
    }
  }

  public async addToQueue(continuation?: string) {
    await this.send({ payload: { continuation } });
  }
}

export const orderUpdatesDynamicOrderJob = new OrderUpdatesDynamicOrderJob();

if (config.doBackgroundWork) {
  cron.schedule(
    // Every 10 minutes
    "*/10 * * * *",
    async () =>
      await redlock
        .acquire(["dynamic-orders-update-lock"], (10 * 60 - 3) * 1000)
        .then(async () => {
          logger.info(orderUpdatesDynamicOrderJob.queueName, "Triggering dynamic orders update");
          await orderUpdatesDynamicOrderJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
