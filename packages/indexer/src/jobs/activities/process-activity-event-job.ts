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

export enum ProcessActivityEventJobKind {
  fillEvent = "fillEvent",
  nftTransferEvent = "nftTransferEvent",
  newSellOrder = "newSellOrder",
  newBuyOrder = "newBuyOrder",
  sellOrderCancelled = "sellOrderCancelled",
  buyOrderCancelled = "buyOrderCancelled",
}

export type ProcessActivityEventJobPayload =
  | {
      kind: ProcessActivityEventJobKind.newSellOrder;
      data: NewSellOrderEventData;
      context?: string;
      checkForMore?: boolean | undefined;
    }
  | {
      kind: ProcessActivityEventJobKind.newBuyOrder;
      data: NewBuyOrderEventData;
      context?: string;
      checkForMore?: boolean | undefined;
    }
  | {
      kind: ProcessActivityEventJobKind.nftTransferEvent;
      data: NftTransferEventData;
      context?: string;
      checkForMore?: boolean | undefined;
    }
  | {
      kind: ProcessActivityEventJobKind.fillEvent;
      data: FillEventData;
      context?: string;
      checkForMore?: boolean | undefined;
    }
  | {
      kind: ProcessActivityEventJobKind.sellOrderCancelled;
      data: SellOrderCancelledEventData;
      context?: string;
      checkForMore?: boolean | undefined;
    }
  | {
      kind: ProcessActivityEventJobKind.buyOrderCancelled;
      data: BuyOrderCancelledEventData;
      context?: string;
      checkForMore?: boolean | undefined;
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
      [ProcessActivityEventJobKind.fillEvent]: [] as FillEventData[],
      [ProcessActivityEventJobKind.nftTransferEvent]: [] as NftTransferEventData[],
      [ProcessActivityEventJobKind.newSellOrder]: [] as NewSellOrderEventData[],
      [ProcessActivityEventJobKind.newBuyOrder]: [] as NewBuyOrderEventData[],
      [ProcessActivityEventJobKind.buyOrderCancelled]: [] as BuyOrderCancelledEventData[],
      [ProcessActivityEventJobKind.sellOrderCancelled]: [] as SellOrderCancelledEventData[],
    };

    // Aggregate activities by kind
    for (const activity of activitiesToProcess) {
      switch (activity.kind) {
        case ProcessActivityEventJobKind.fillEvent:
          aggregatedActivities[ProcessActivityEventJobKind.fillEvent].push(
            activity.data as FillEventData
          );
          break;

        case ProcessActivityEventJobKind.nftTransferEvent:
          aggregatedActivities[ProcessActivityEventJobKind.nftTransferEvent].push(
            activity.data as NftTransferEventData
          );
          break;

        case ProcessActivityEventJobKind.newSellOrder:
          aggregatedActivities[ProcessActivityEventJobKind.newSellOrder].push(
            activity.data as NewSellOrderEventData
          );
          break;

        case ProcessActivityEventJobKind.newBuyOrder:
          aggregatedActivities[ProcessActivityEventJobKind.newBuyOrder].push(
            activity.data as NewBuyOrderEventData
          );
          break;

        case ProcessActivityEventJobKind.buyOrderCancelled:
          aggregatedActivities[ProcessActivityEventJobKind.buyOrderCancelled].push(
            activity.data as BuyOrderCancelledEventData
          );
          break;

        case ProcessActivityEventJobKind.sellOrderCancelled:
          aggregatedActivities[ProcessActivityEventJobKind.sellOrderCancelled].push(
            activity.data as SellOrderCancelledEventData
          );
          break;
      }
    }

    for (const [kind, activities] of Object.entries(aggregatedActivities)) {
      if (!_.isEmpty(activities)) {
        try {
          switch (kind) {
            case ProcessActivityEventJobKind.fillEvent:
              await SaleActivity.handleEvents(activities as FillEventData[]);
              break;

            case ProcessActivityEventJobKind.nftTransferEvent:
              await TransferActivity.handleEvents(activities as NftTransferEventData[]);
              break;

            case ProcessActivityEventJobKind.newSellOrder:
              await AskActivity.handleEvents(activities as NewSellOrderEventData[]);
              break;

            case ProcessActivityEventJobKind.newBuyOrder:
              await BidActivity.handleEvents(activities as NewBuyOrderEventData[]);
              break;

            case ProcessActivityEventJobKind.buyOrderCancelled:
              await BidCancelActivity.handleEvents(activities as BuyOrderCancelledEventData[]);
              break;

            case ProcessActivityEventJobKind.sellOrderCancelled:
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

  public async addActivitiesToList(events: ProcessActivityEventJobPayload[]) {
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
