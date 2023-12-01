import cron from "node-cron";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { redis, redlock } from "@/common/redis";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import { PendingActivityEventsQueue } from "@/elasticsearch/indexes/activities/pending-activity-events-queue";
import { EventKind } from "@/jobs/elasticsearch/activities/process-activity-event-job";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import {
  NftTransferEventInfo,
  OrderEventInfo,
} from "@/elasticsearch/indexes/activities/event-handlers/base";
import { ActivityDocument } from "@/elasticsearch/indexes/activities/base";
import { NftTransferEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/nft-transfer-event-created";
import { FillEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/fill-event-created";
import { AskCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-created";
import { BidCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/bid-created";
import { AskCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-cancelled";
import { BidCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/bid-cancelled";

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

    const limit = Number(await redis.get(`${this.queueName}-${eventKind}-limit`)) || 100;

    const pendingActivityEvents = await pendingActivityEventsQueue.get(limit);

    if (pendingActivityEvents.length > 0) {
      try {
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
          case EventKind.newSellOrder:
            activities = await AskCreatedEventHandler.generateActivities(
              pendingActivityEvents.map((event) => event.data as OrderEventInfo)
            );
            break;
          case EventKind.newBuyOrder:
            activities = await BidCreatedEventHandler.generateActivities(
              pendingActivityEvents.map((event) => event.data as OrderEventInfo)
            );
            break;
          case EventKind.sellOrderCancelled:
            activities = await AskCancelledEventHandler.generateActivities(
              pendingActivityEvents.map((event) => event.data as OrderEventInfo)
            );
            break;
          case EventKind.buyOrderCancelled:
            activities = await BidCancelledEventHandler.generateActivities(
              pendingActivityEvents.map((event) => event.data as OrderEventInfo)
            );
            break;
        }

        if (activities?.length) {
          await pendingActivitiesQueue.add(activities);
        }
      } catch (error) {
        logger.error(
          this.queueName,
          `failed to process activity events. eventKind=${eventKind}, error=${JSON.stringify(
            error
          )}`
        );

        await pendingActivityEventsQueue.add(pendingActivityEvents);
      }

      addToQueue = pendingActivityEvents.length === limit;
    }

    return { addToQueue };
  }

  public async onCompleted(message: RabbitMQMessage, processResult: { addToQueue: boolean }) {
    if (processResult.addToQueue) {
      await this.addToQueue(message.payload.eventKind);
    }
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
    config.chainId === 1 ? "*/5 * * * * *" : "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(
          [`${processActivityEventsJob.queueName}-cron-lock`],
          config.chainId === 1 ? (5 - 1) * 1000 : (5 - 1) * 1000
        )
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
