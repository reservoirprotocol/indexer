import { logger } from "@/common/logger";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import { NftTransferEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/nft-transfer-event-created";
import { PendingActivityEventsQueue } from "@/elasticsearch/indexes/activities/pending-activity-events-queue";

import { config } from "@/config/index";
import cron from "node-cron";
import { redis, redlock } from "@/common/redis";
import { EventKind } from "@/jobs/activities/process-activity-event-job";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { NftTransferEventInfo } from "@/elasticsearch/indexes/activities/event-handlers/base";
import { FillEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/fill-event-created";
import { ActivityDocument } from "@/elasticsearch/indexes/activities/base";

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

    let addToQueue = false;

    const pendingActivitiesQueue = new PendingActivitiesQueue();
    const pendingActivityEventsQueue = new PendingActivityEventsQueue(eventKind);

    const limit = Number(await redis.get(`${this.queueName}-limit`)) || 50;

    const pendingActivityEvents = await pendingActivityEventsQueue.get(limit);

    if (pendingActivityEvents.length > 0) {
      try {
        const startGenerateActivities = Date.now();

        let activities: ActivityDocument[] = [];

        switch (eventKind) {
          case EventKind.nftTransferEvent:
            activities = await NftTransferEventCreatedEventHandler.generateActivities(
              pendingActivityEvents.map((event) => event.data as NftTransferEventInfo)
            );
            break;
          case EventKind.fillEvent:
            activities = await FillEventCreatedEventHandler.generateActivities(
              pendingActivityEvents.map((event) => event.data as NftTransferEventInfo)
            );
            break;
        }

        const endGenerateActivities = Date.now();

        logger.info(
          this.queueName,
          JSON.stringify({
            message: `Generated ${activities?.length} activities`,
            activities,
            eventKind,
            limit,
            latency: endGenerateActivities - startGenerateActivities,
          })
        );

        if (activities?.length) {
          await pendingActivitiesQueue.add(activities);
        }
      } catch (error) {
        logger.error(this.queueName, `failed to process activity events. error=${error}`);

        await pendingActivityEventsQueue.add(pendingActivityEvents);
      }

      addToQueue = pendingActivityEvents.length === limit;
    }

    return { addToQueue };
  }

  public events() {
    this.once(
      "onCompleted",
      async (message: RabbitMQMessage, processResult: { addToQueue: boolean }) => {
        if (processResult.addToQueue) {
          await this.addToQueue(message.payload.eventKind);
        }
      }
    );
  }

  public async addToQueue(eventKind: EventKind) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload: { eventKind }, jobId: eventKind });
  }
}

export const processActivityEventsJob = new ProcessActivityEventsJob();

if (config.doBackgroundWork && config.doElasticsearchWork) {
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire([`${processActivityEventsJob.queueName}-cron-lock`], (5 - 1) * 1000)
        .then(async () => {
          for (const eventKind of Object.values(EventKind)) {
            await processActivityEventsJob.addToQueue(eventKind);
          }
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
