import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { AskActivity, NewSellOrderEventData } from "@/jobs/activities/ask-activity";
import { BidActivity, NewBuyOrderEventData } from "@/jobs/activities/bid-activity";
import { NftTransferEventData, TransferActivity } from "@/jobs/activities/transfer-activity";
import { FillEventData, SaleActivity } from "@/jobs/activities/sale-activity";
import {
  AskCancelActivity,
  SellOrderCancelledEventData,
} from "@/jobs/activities/ask-cancel-activity";
import {
  BidCancelActivity,
  BuyOrderCancelledEventData,
} from "@/jobs/activities/bid-cancel-activity";
import { ActivitiesList } from "@/models/activities/activities-list";
import _ from "lodash";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import cron from "node-cron";
import { redlock } from "@/common/redis";

export enum ActivityEventKind {
  fillEvent = "fillEvent",
  nftTransferEvent = "nftTransferEvent",
  newSellOrder = "newSellOrder",
  newBuyOrder = "newBuyOrder",
  sellOrderCancelled = "sellOrderCancelled",
  buyOrderCancelled = "buyOrderCancelled",
}

export type ActivityEvent =
  | {
      kind: ActivityEventKind.newSellOrder;
      data: NewSellOrderEventData;
      context?: string;
    }
  | {
      kind: ActivityEventKind.newBuyOrder;
      data: NewBuyOrderEventData;
      context?: string;
    }
  | {
      kind: ActivityEventKind.nftTransferEvent;
      data: NftTransferEventData;
      context?: string;
    }
  | {
      kind: ActivityEventKind.fillEvent;
      data: FillEventData;
      context?: string;
    }
  | {
      kind: ActivityEventKind.sellOrderCancelled;
      data: SellOrderCancelledEventData;
      context?: string;
    }
  | {
      kind: ActivityEventKind.buyOrderCancelled;
      data: BuyOrderCancelledEventData;
      context?: string;
    };

export type ProcessActivityEventJobPayload = {
  checkForMore: boolean;
};

export class ProcessActivityEventJob extends AbstractRabbitMqJobHandler {
  queueName = "process-activity-event-queue";
  maxRetries = 10;
  concurrency = 45;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;

  protected async process(payload: ProcessActivityEventJobPayload) {
    // Get the next batch of activities
    const limit = 75;
    const activitiesList = new ActivitiesList();
    const activitiesToProcess = await activitiesList.get(limit);
    payload.checkForMore = !_.isEmpty(activitiesToProcess);

    const aggregatedActivities = {
      [ActivityEventKind.fillEvent]: [] as FillEventData[],
      [ActivityEventKind.nftTransferEvent]: [] as NftTransferEventData[],
      [ActivityEventKind.newSellOrder]: [] as NewSellOrderEventData[],
      [ActivityEventKind.newBuyOrder]: [] as NewBuyOrderEventData[],
      [ActivityEventKind.buyOrderCancelled]: [] as BuyOrderCancelledEventData[],
      [ActivityEventKind.sellOrderCancelled]: [] as SellOrderCancelledEventData[],
    };

    // Aggregate activities by kind
    for (const activity of activitiesToProcess) {
      switch (activity.kind) {
        case ActivityEventKind.fillEvent:
          aggregatedActivities[ActivityEventKind.fillEvent].push(activity.data as FillEventData);
          break;

        case ActivityEventKind.nftTransferEvent:
          aggregatedActivities[ActivityEventKind.nftTransferEvent].push(
            activity.data as NftTransferEventData
          );
          break;

        case ActivityEventKind.newSellOrder:
          aggregatedActivities[ActivityEventKind.newSellOrder].push(
            activity.data as NewSellOrderEventData
          );
          break;

        case ActivityEventKind.newBuyOrder:
          aggregatedActivities[ActivityEventKind.newBuyOrder].push(
            activity.data as NewBuyOrderEventData
          );
          break;

        case ActivityEventKind.buyOrderCancelled:
          aggregatedActivities[ActivityEventKind.buyOrderCancelled].push(
            activity.data as BuyOrderCancelledEventData
          );
          break;

        case ActivityEventKind.sellOrderCancelled:
          aggregatedActivities[ActivityEventKind.sellOrderCancelled].push(
            activity.data as SellOrderCancelledEventData
          );
          break;
      }
    }

    for (const [kind, activities] of Object.entries(aggregatedActivities)) {
      if (!_.isEmpty(activities)) {
        try {
          switch (kind) {
            case ActivityEventKind.fillEvent:
              await SaleActivity.handleEvents(activities as FillEventData[]);
              break;

            case ActivityEventKind.nftTransferEvent:
              await TransferActivity.handleEvents(activities as NftTransferEventData[]);
              break;

            case ActivityEventKind.newSellOrder:
              await AskActivity.handleEvents(activities as NewSellOrderEventData[]);
              break;

            case ActivityEventKind.newBuyOrder:
              await BidActivity.handleEvents(activities as NewBuyOrderEventData[]);
              break;

            case ActivityEventKind.buyOrderCancelled:
              await BidCancelActivity.handleEvents(activities as BuyOrderCancelledEventData[]);
              break;

            case ActivityEventKind.sellOrderCancelled:
              await AskCancelActivity.handleEvents(activities as SellOrderCancelledEventData[]);
              break;
          }
        } catch (error) {
          logger.error(
            this.queueName,
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

  public async addActivitiesToList(events: ActivityEvent[]) {
    const activitiesList = new ActivitiesList();
    await activitiesList.add(events);
  }

  public async addToQueue() {
    await this.send({ payload: { checkForMore: false } });
  }
}

export const processActivityEventJob = new ProcessActivityEventJob();

processActivityEventJob.on("onCompleted", async (message) => {
  if (message.payload.checkForMore) {
    await processActivityEventJob.addToQueue();
  }
});

if (config.doBackgroundWork) {
  cron.schedule(
    "*/5 * * * * *",
    async () =>
      await redlock
        .acquire(["save-activities"], (5 - 1) * 1000)
        .then(async () => processActivityEventJob.addToQueue())
        .catch(() => {
          // Skip on any errors
        })
  );
}
