import cron from "node-cron";

import { idb, pgp } from "@/common/db";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { orderUpdatesByIdJob } from "@/jobs/order-updates/order-updates-by-id-job";
import * as onChainData from "@/utils/on-chain-data";

export class ExpiredPermitsJob extends AbstractRabbitMqJobHandler {
  queueName = "expired-permits";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;
  useSharedChannel = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;
  intervalInSeconds = 60;

  public async process() {
    logger.info(this.queueName, "Invalidating expired permits");

    try {
      const relevantPermits = await idb.manyOrNone(
        `
          UPDATE permits SET
            is_valid = FALSE
          WHERE permits.deadline < extract(epoch from now())
            AND permits.is_valid
          RETURNING
            permits.id,
            permits.index,
            permits.owner
        `
      );
      for (const permit of relevantPermits) {
        const invalidatedOrders = await idb.manyOrNone(
          `
            SELECT
              orders.id,
              orders.currency,
              orders.maker,
              orders.conduit,
              orders.price,
              orders.quantity_remaining
            FROM orders
            WHERE orders.maker = $/owner/
              AND orders.side = 'buy'
              AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
              AND orders.raw_data->>'permitId'::TEXT = $/permitId/
              AND COALESCE(orders.raw_data->>'permitIndex'::TEXT, '0')::INT = $/permitIndex/
          `,
          {
            maker: toBuffer(permit.owner),
            permitId: permit.id,
            permitIndex: permit.index,
          }
        );
        if (invalidatedOrders.length) {
          // Update any orders that did change status

          const noApprovalOrderIds: string[] = [];
          for (const order of invalidatedOrders) {
            const orderAmount = bn(order.price).mul(order.quantity_remaining);
            const approvedAmount = await onChainData
              .fetchAndUpdateFtApproval(
                fromBuffer(order.currency),
                fromBuffer(order.maker),
                fromBuffer(order.conduit),
                true
              )
              .then((a) => a.value);
            if (orderAmount.gt(approvedAmount)) {
              noApprovalOrderIds.push(order.id);
            }
          }

          if (noApprovalOrderIds.length) {
            const values = noApprovalOrderIds.map((id) => ({
              id,
              fillability_status: "cancelled",
            }));
            const columns = new pgp.helpers.ColumnSet(["id", "fillability_status"], {
              table: "orders",
            });

            await idb.none(
              `
                UPDATE orders SET
                  fillability_status = x.fillability_status::order_fillability_status_t,
                  updated_at = now()
                FROM (VALUES ${pgp.helpers.values(values, columns)}) AS x(id, fillability_status)
                WHERE orders.id = x.id::TEXT
              `
            );

            // Recheck all updated orders
            await orderUpdatesByIdJob.addToQueue(
              values.map(({ id }) => ({
                context: `${context}-${id}`,
                id,
                trigger: {
                  kind: "cancel",
                },
              }))
            );
          }
        }
      }

      if (relevantPermits.length) {
        logger.info(this.queueName, `Invalidated ${relevantPermits.length} permits`);
      }
    } catch (error) {
      logger.error(this.queueName, `Failed to handle expired-permits info: ${error}`);
      throw error;
    }
  }

  public async addToQueue() {
    await this.send();
  }
}

export const expiredPermitsJob = new ExpiredPermitsJob();

if (config.doBackgroundWork) {
  cron.schedule(`*/${expiredPermitsJob.intervalInSeconds} * * * * *`, async () =>
    redlock
      .acquire(["expired-permits-check-lock"], (expiredPermitsJob.intervalInSeconds - 3) * 1000)
      .then(async () => {
        logger.info(expiredPermitsJob.queueName, "Triggering expired permits check");
        await expiredPermitsJob.addToQueue();
      })
      .catch(() => {
        // Skip any errors
      })
  );
}
