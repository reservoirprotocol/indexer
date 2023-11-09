import { logger } from "@/common/logger";
import { config } from "@/config/index";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingExpiredBidActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-expired-bid-activities-queue";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";

const BATCH_SIZE = 1000;

export default class DeleteArchivedExpiredBidActivitiesJob extends AbstractRabbitMqJobHandler {
  queueName = "delete-archived-expired-bid-activities-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  singleActiveConsumer = true;

  public async process() {
    const pendingExpiredBidActivitiesQueue = new PendingExpiredBidActivitiesQueue();
    const pendingActivityIds = await pendingExpiredBidActivitiesQueue.get(BATCH_SIZE);

    logger.info(
      this.queueName,
      `deleting activities. pendingActivitiesCount=${pendingActivityIds?.length}`
    );

    if (pendingActivityIds?.length > 0) {
      try {
        await ActivitiesIndex.deleteActivitiesById(pendingActivityIds);
      } catch (error) {
        logger.error(
          this.queueName,
          `failed to delete activities. error=${error}, pendingActivities=${JSON.stringify(
            pendingActivityIds
          )}`
        );

        await pendingExpiredBidActivitiesQueue.add(pendingActivityIds);
      }

      const pendingActivitiesCount = await pendingExpiredBidActivitiesQueue.count();

      if (pendingActivitiesCount > 0) {
        await deleteArchivedExpiredBidActivitiesJob.addToQueue();
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

export const deleteArchivedExpiredBidActivitiesJob = new DeleteArchivedExpiredBidActivitiesJob();
