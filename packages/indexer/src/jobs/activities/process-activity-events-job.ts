import { logger } from "@/common/logger";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import { NftTransferEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/nft-transfer-event-created";
import { PendingActivityEventsQueue } from "@/elasticsearch/indexes/activities/pending-activity-events-queue";

import { config } from "@/config/index";
import cron from "node-cron";
import { redlock } from "@/common/redis";
import { EventKind } from "@/jobs/activities/process-activity-event-job";

export type ProcessActivityEventsJobPayload = {
  eventKind: EventKind;
};

export class ProcessActivityEventsJob extends AbstractRabbitMqJobHandler {
  queueName = "process-activity-events-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;

  protected async process(payload: ProcessActivityEventsJobPayload) {
    const { eventKind } = payload;

    const pendingActivitiesQueue = new PendingActivitiesQueue();
    const pendingActivityEventsQueue = new PendingActivityEventsQueue(eventKind);

    const pendingActivityEvents = await pendingActivityEventsQueue.get(50);

    if (pendingActivityEvents.length > 0) {
      try {
        const startGenerateActivities = Date.now();

        const activities = await NftTransferEventCreatedEventHandler.generateActivities(
          pendingActivityEvents.map((event) => event.data)
        );

        const endGenerateActivities = Date.now();

        logger.info(
          this.queueName,
          JSON.stringify({
            message: `Generated ${activities.length} activities`,
            activities,
            latency: endGenerateActivities - startGenerateActivities,
          })
        );

        if (activities.length) {
          await pendingActivitiesQueue.add(activities);
        }
      } catch (error) {
        logger.error(this.queueName, `failed to process activity events. error=${error}`);

        await pendingActivityEventsQueue.add(pendingActivityEvents);
      }
    }
  }

  public async addToQueue(eventKind: EventKind) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload: { eventKind } });
  }
}

export const processActivityEventsJob = new ProcessActivityEventsJob();

if (config.doBackgroundWork && config.doElasticsearchWork) {
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire([`${processActivityEventsJob.queueName}-cron-lock`], (5 - 1) * 1000)
        .then(async () => processActivityEventsJob.addToQueue(EventKind.nftTransferEvent))
        .catch(() => {
          // Skip on any errors
        })
  );
}
