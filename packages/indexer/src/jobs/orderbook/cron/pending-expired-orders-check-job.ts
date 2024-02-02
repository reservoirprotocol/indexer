import cron from "node-cron";

import { ridb } from "@/common/db";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import * as backfillExpiredOrders from "@/jobs/backfill/backfill-expired-orders-2";

export class PendingExpiredOrdersCheckJob extends AbstractRabbitMqJobHandler {
  queueName = "pending-expired-orders-check-queue";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;

  public async process() {
    const result = await ridb.oneOrNone(
      `
        SELECT
          count(*) AS expired_count
        FROM orders
        WHERE upper(orders.valid_between) < now()
          AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
      `
    );

    logger.info(
      "pending-expired-orders-check",
      JSON.stringify({ pendingExpiredOrdersCount: result.expired_count })
    );

    if (result.expired_count > 0) {
      const minResult = await ridb.oneOrNone(
        `
          SELECT
            floor(extract(epoch FROM min(upper(orders.valid_between)))) AS min_timestamp
          FROM orders
          WHERE upper(orders.valid_between) < now()
            AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
        `
      );
      if (minResult) {
        await backfillExpiredOrders.addToQueue([
          {
            from: Number(minResult.min_timestamp),
            to: Number(minResult.min_timestamp) + 10000,
          },
        ]);
      }
    }
  }

  public async addToQueue() {
    await this.send();
  }
}

export const pendingExpiredOrdersCheckJob = new PendingExpiredOrdersCheckJob();

if (config.doBackgroundWork) {
  cron.schedule(
    `0 */1 * * *`,
    async () =>
      await redlock
        .acquire(["pending-expired-orders-check-lock"], (1 * 3600 - 5) * 1000)
        .then(async () => {
          await pendingExpiredOrdersCheckJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
