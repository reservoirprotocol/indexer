import { logger } from "@/common/logger";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/queue";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { ActivityType } from "@/elasticsearch/indexes/activities/base";
import { fixActivitiesMissingCollectionJob } from "@/jobs/activities/fix-activities-missing-collection-job";

export class SavePendingActivitiesJob extends AbstractRabbitMqJobHandler {
  queueName = "save-pending-activities-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  useSharedChannel = true;

  protected async process() {
    const limit = 75;
    const pendingActivitiesQueue = new PendingActivitiesQueue();
    const pendingActivities = await pendingActivitiesQueue.get(limit);

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

    if (pendingActivities.length > 0) {
      logger.info(this.queueName, `requeue job.`);

      await savePendingActivitiesJob.addToQueue();
    }
  }

  public async addToQueue() {
    await this.send();
  }
}

export const savePendingActivitiesJob = new SavePendingActivitiesJob();
