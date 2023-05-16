/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis, redlock } from "@/common/redis";
import { config } from "@/config/index";
import { SaleActivity, FillEventData } from "@/jobs/activities/sale-activity";
import { TransferActivity, NftTransferEventData } from "@/jobs/activities/transfer-activity";
import { AskActivity, NewSellOrderEventData } from "@/jobs/activities/ask-activity";
import { BidActivity, NewBuyOrderEventData } from "@/jobs/activities/bid-activity";
import {
  BidCancelActivity,
  BuyOrderCancelledEventData,
} from "@/jobs/activities/bid-cancel-activity";
import {
  AskCancelActivity,
  SellOrderCancelledEventData,
} from "@/jobs/activities/ask-cancel-activity";
import { ActivitiesList } from "@/models/activities/activities-list";
import cron from "node-cron";

const QUEUE_NAME = "process-activity-event-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 50000,
    backoff: {
      type: "fixed",
      delay: 5000,
    },
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (!_.isEmpty(job.data)) {
        const { kind, data } = job.data as EventInfo;

        switch (kind) {
          case EventKind.fillEvent:
            await SaleActivity.handleEvent(data as FillEventData);
            break;

          case EventKind.nftTransferEvent:
            await TransferActivity.handleEvent(data as NftTransferEventData);
            break;

          case EventKind.newSellOrder:
            await AskActivity.handleEvent(data as NewSellOrderEventData);
            break;

          case EventKind.newBuyOrder:
            await BidActivity.handleEvent(data as NewBuyOrderEventData);
            break;

          case EventKind.buyOrderCancelled:
            await BidCancelActivity.handleEvent(data as BuyOrderCancelledEventData);
            break;

          case EventKind.sellOrderCancelled:
            await AskCancelActivity.handleEvent(data as SellOrderCancelledEventData);
            break;
        }
      } else {
        // Get the next batch of activities
        const limit = 75;
        const activitiesList = new ActivitiesList();
        const activitiesToProcess = await activitiesList.get(limit);
        job.data.checkForMore = !_.isEmpty(activitiesToProcess);

        const aggregatedActivities = {
          [EventKind.fillEvent]: [] as FillEventData[],
          [EventKind.nftTransferEvent]: [] as NftTransferEventData[],
          [EventKind.newSellOrder]: [] as NewSellOrderEventData[],
          [EventKind.newBuyOrder]: [] as NewBuyOrderEventData[],
          [EventKind.buyOrderCancelled]: [] as BuyOrderCancelledEventData[],
          [EventKind.sellOrderCancelled]: [] as SellOrderCancelledEventData[],
        };

        // Aggregate activities by kind
        for (const activity of activitiesToProcess) {
          switch (activity.kind) {
            case EventKind.fillEvent:
              aggregatedActivities[EventKind.fillEvent].push(activity.data as FillEventData);
              break;

            case EventKind.nftTransferEvent:
              aggregatedActivities[EventKind.nftTransferEvent].push(
                activity.data as NftTransferEventData
              );
              break;

            case EventKind.newSellOrder:
              aggregatedActivities[EventKind.newSellOrder].push(
                activity.data as NewSellOrderEventData
              );
              break;

            case EventKind.newBuyOrder:
              aggregatedActivities[EventKind.newBuyOrder].push(
                activity.data as NewBuyOrderEventData
              );
              break;

            case EventKind.buyOrderCancelled:
              aggregatedActivities[EventKind.buyOrderCancelled].push(
                activity.data as BuyOrderCancelledEventData
              );
              break;

            case EventKind.sellOrderCancelled:
              aggregatedActivities[EventKind.sellOrderCancelled].push(
                activity.data as SellOrderCancelledEventData
              );
              break;
          }
        }

        for (const [kind, activities] of Object.entries(aggregatedActivities)) {
          if (!_.isEmpty(activities)) {
            try {
              switch (kind) {
                case EventKind.fillEvent:
                  await SaleActivity.handleEvents(activities as FillEventData[]);
                  break;

                case EventKind.nftTransferEvent:
                  await TransferActivity.handleEvents(activities as NftTransferEventData[]);
                  break;

                case EventKind.newSellOrder:
                  await AskActivity.handleEvents(activities as NewSellOrderEventData[]);
                  break;

                case EventKind.newBuyOrder:
                  await BidActivity.handleEvents(activities as NewBuyOrderEventData[]);
                  break;

                case EventKind.buyOrderCancelled:
                  await BidCancelActivity.handleEvents(activities as BuyOrderCancelledEventData[]);
                  break;

                case EventKind.sellOrderCancelled:
                  await AskCancelActivity.handleEvents(activities as SellOrderCancelledEventData[]);
                  break;
              }
            } catch (error) {
              logger.error(
                QUEUE_NAME,
                `failed to insert into activities error ${error} kind ${kind} activities=${JSON.stringify(
                  activities
                )}`
              );

              await activitiesList.add(activitiesToProcess);
              return;
            }
          }
        }
      }
    },
    { connection: redis.duplicate(), concurrency: 45 }
  );

  worker.on("completed", async (job) => {
    if (job.data.checkForMore) {
      await addToQueue();
    }
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export enum EventKind {
  fillEvent = "fillEvent",
  nftTransferEvent = "nftTransferEvent",
  newSellOrder = "newSellOrder",
  newBuyOrder = "newBuyOrder",
  sellOrderCancelled = "sellOrderCancelled",
  buyOrderCancelled = "buyOrderCancelled",
}

export type EventInfo =
  | {
      kind: EventKind.newSellOrder;
      data: NewSellOrderEventData;
      context?: string;
    }
  | {
      kind: EventKind.newBuyOrder;
      data: NewBuyOrderEventData;
      context?: string;
    }
  | {
      kind: EventKind.nftTransferEvent;
      data: NftTransferEventData;
      context?: string;
    }
  | {
      kind: EventKind.fillEvent;
      data: FillEventData;
      context?: string;
    }
  | {
      kind: EventKind.sellOrderCancelled;
      data: SellOrderCancelledEventData;
      context?: string;
    }
  | {
      kind: EventKind.buyOrderCancelled;
      data: BuyOrderCancelledEventData;
      context?: string;
    };

export const addActivitiesToList = async (events: EventInfo[]) => {
  const activitiesList = new ActivitiesList();
  await activitiesList.add(events);
};

export const addToQueue = async () => {
  await queue.add(randomUUID(), {});
};

if (config.doBackgroundWork) {
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(["save-activities"], (5 - 1) * 1000)
        .then(async () => addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
