import cron from "node-cron";

import { ridb } from "@/common/db";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";

export class PendingExpiredOrdersCheckJob extends AbstractRabbitMqJobHandler {
  queueName = "pending-expired-orders-check-queue";
  maxRetries = 1;
  concurrency = 1;
  lazyMode = true;
  singleActiveConsumer = true;

  protected async process() {
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
  }

  public async addToQueue() {
    await this.send();
  }
}

export const pendingExpiredOrdersCheckJob = new PendingExpiredOrdersCheckJob();

if (config.doBackgroundWork) {
  cron.schedule(
    `0 */2 * * *`,
    async () =>
      await redlock
        .acquire(["pending-expired-orders-check-lock"], (2 * 3600 - 5) * 1000)
        .then(async () => {
          await pendingExpiredOrdersCheckJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
