import { logger } from "@/common/logger";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/queue";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import { fixActivitiesMissingCollectionJob } from "@/jobs/activities/fix-activities-missing-collection-job";
import { config } from "@/config/index";
import cron from "node-cron";
import { redlock } from "@/common/redis";

const BATCH_SIZE = 500;

export class SavePendingActivitiesJob extends AbstractRabbitMqJobHandler {
  queueName = "save-pending-activities-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process() {
    const pendingActivitiesQueue = new PendingActivitiesQueue();
    const pendingActivities = await pendingActivitiesQueue.get(BATCH_SIZE);

    if (pendingActivities.length > 0) {
      try {
        await ActivitiesIndex.save(pendingActivities, false);

        for (const activity of pendingActivities) {
          // If collection information is not available yet when a mint event
          if (activity.type === ActivityType.mint && !activity.collection?.id) {
            await fixActivitiesMissingCollectionJob.addToQueue({
              contract: activity.contract,
              tokenId: activity.token!.id,
            });
          }
        }
      } catch (error) {
        logger.error(
          this.queueName,
          `failed to insert into activities. error=${error}, pendingActivities=${JSON.stringify(
            pendingActivities
          )}`
        );

        await pendingActivitiesQueue.add(pendingActivities);
      }

      const pendingActivitiesCount = await pendingActivitiesQueue.count();

      if (pendingActivitiesCount > 0) {
        await savePendingActivitiesJob.addToQueue();
      }
    }
  }

  public async addToQueue() {
    if (!config.doElasticsearchWork) {
      return;
    }
    await this.send();
  }
}

export const getLockName = () => {
  return `${savePendingActivitiesJob.queueName}-lock`;
};

export const savePendingActivitiesJob = new SavePendingActivitiesJob();

if (config.doBackgroundWork && config.doElasticsearchWork) {
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(["save-pending-activities-queue-lock"], (5 - 1) * 1000)
        .then(async () => savePendingActivitiesJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
