import cron from "node-cron";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redlock } from "@/common/redis";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";

export default class MintsExpiredJob extends AbstractRabbitMqJobHandler {
  queueName = "expired-mints";
  maxRetries = 1;
  concurrency = 1;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;
  intervalInSeconds = 60;

  public async process() {
    logger.info(this.queueName, "Invalidating expired mints");

    await idb.none(
      `
          UPDATE collection_mints SET
            status = 'closed'
          WHERE collection_mints.end_time <= now()
            AND collection_mints.status = 'open'
        `
    );
  }

  public async addToQueue() {
    await this.send();
  }
}

export const mintsExpiredJob = new MintsExpiredJob();

if (config.doBackgroundWork) {
  cron.schedule(
    `*/${mintsExpiredJob.intervalInSeconds} * * * * *`,
    async () =>
      await redlock
        .acquire(["expired-mints-check-lock"], (mintsExpiredJob.intervalInSeconds - 3) * 1000)
        .then(async () => {
          logger.info(mintsExpiredJob.queueName, "Triggering expired mints check");
          await mintsExpiredJob.addToQueue();
        })
        .catch(() => {
          // Skip any errors
        })
  );
}
