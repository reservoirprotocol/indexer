import cron from "node-cron";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import { fixActivitiesMissingCollectionJob } from "@/jobs/activities/fix-activities-missing-collection-job";

const BATCH_SIZE = 500;

export default class SavePendingActivitiesJob extends AbstractRabbitMqJobHandler {
  queueName = "save-pending-activities-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  public async process() {
    const pendingActivitiesQueue = new PendingActivitiesQueue();
    const pendingActivities = await pendingActivitiesQueue.get(BATCH_SIZE);

    if (pendingActivities.length > 0) {
      try {
        const pendingSaleActivities = pendingActivities.filter(
          (activity) => activity.type === ActivityType.sale
        );
        const pendingNonSaleActivities = pendingActivities.filter(
          (activity) => activity.type !== ActivityType.sale
        );

        if (pendingSaleActivities.length) {
          await ActivitiesIndex.save(pendingSaleActivities, true, false);
        }

        if (pendingNonSaleActivities.length) {
          await ActivitiesIndex.save(pendingNonSaleActivities, false, false);
        }

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
        logger.error(this.queueName, `failed to insert into activities. error=${error}`);

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
    config.chainId === 1 ? "*/5 * * * * *" : "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(
          ["save-pending-activities-queue-lock"],
          config.chainId === 1 ? (5 - 1) * 1000 : (5 - 1) * 1000
        )
        .then(async () => savePendingActivitiesJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
