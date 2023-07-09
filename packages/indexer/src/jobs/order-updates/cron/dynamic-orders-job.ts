import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";
import _ from "lodash";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { getUSDAndNativePrices } from "@/utils/prices";
import { fromBuffer, now } from "@/common/utils";
import cron from "node-cron";
import { redlock } from "@/common/redis";

export type OrderUpdatesDynamicOrderJobPayload = {
  continuation?: string;
};

export class OrderUpdatesDynamicOrderJob extends AbstractRabbitMqJobHandler {
  queueName = "dynamic-orders";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;
  useSharedChannel = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  protected async process(payload: OrderUpdatesDynamicOrderJobPayload) {
    const { continuation } = payload;

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

          const prices = await getUSDAndNativePrices(fromBuffer(currency), newCurrencyPrice, now());
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
    } catch (error) {
      logger.error(this.queueName, `Failed to handle dynamic orders: ${error}`);
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
