import _ from "lodash";
import cron from "node-cron";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { now } from "@/common/utils";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import * as backfillExpiredOrders from "@/jobs/backfill/backfill-expired-orders";

export default class OrderUpdatesExpiredOrderJob extends AbstractRabbitMqJobHandler {
  queueName = "expired-orders";
  maxRetries = 1;
  concurrency = 1;
  singleActiveConsumer = true;
  useSharedChannel = true;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;
  intervalInSeconds = 5;

  protected async process() {
    logger.info(this.queueName, "Invalidating expired orders");

    const currentTime = now();
    const lastTimestampKey = "expired-orders-last-timestamp";
    const lastTimestamp = await redis
      .get(lastTimestampKey)
      .then((t) => (t ? Number(_.max([Number(t), currentTime - 60 * 60 * 24])) : now()));

    // Update the expired orders second by second
    if (currentTime > lastTimestamp) {
      await backfillExpiredOrders.addToQueue(
        _.range(0, currentTime - lastTimestamp + 1).map((s) => currentTime - s)
      );
    }

    // Make sure to have some redundancy checks
    await redis.set(lastTimestampKey, currentTime - this.intervalInSeconds);
  }

  public async addToQueue() {
    await this.send();
  }
}

export const orderUpdatesExpiredOrderJob = new OrderUpdatesExpiredOrderJob();

if (config.doBackgroundWork) {
  cron.schedule(
    `*/${orderUpdatesExpiredOrderJob.intervalInSeconds} * * * * *`,
    async () =>
      await redlock
        .acquire(
          ["expired-orders-check-lock"],
          (orderUpdatesExpiredOrderJob.intervalInSeconds - 3) * 1000
        )
        .then(async () => {
          logger.info(orderUpdatesExpiredOrderJob.queueName, "Triggering expired orders check");
          await orderUpdatesExpiredOrderJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
