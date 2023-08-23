import { logger } from "@/common/logger";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/pending-activities-queue";
import { FillEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/fill-event-created";
import { NftTransferEventInfo } from "@/elasticsearch/indexes/activities/event-handlers/nft-transfer-event-created";
import { AskCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-created";
import { BidCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/bid-created";
import { BidCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/bid-cancelled";
import { AskCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-cancelled";
import { PendingActivityEventsQueue } from "@/elasticsearch/indexes/activities/pending-activity-events-queue";
import { config } from "@/config/index";

export enum EventKind {
  fillEvent = "fillEvent",
  nftTransferEvent = "nftTransferEvent",
  newSellOrder = "newSellOrder",
  newBuyOrder = "newBuyOrder",
  sellOrderCancelled = "sellOrderCancelled",
  buyOrderCancelled = "buyOrderCancelled",
}

export type ProcessActivityEventJobPayload =
  | {
      kind: EventKind.newSellOrder;
      data: {
        orderId: string;
        transactionHash?: string;
        logIndex?: number;
        batchIndex?: number;
      };
      context?: string;
    }
  | {
      kind: EventKind.newBuyOrder;
      data: {
        orderId: string;
        transactionHash?: string;
        logIndex?: number;
        batchIndex?: number;
      };
      context?: string;
    }
  | {
      kind: EventKind.nftTransferEvent;
      data: {
        transactionHash: string;
        logIndex: number;
        batchIndex: number;
      };
      context?: string;
    }
  | {
      kind: EventKind.fillEvent;
      data: {
        transactionHash: string;
        logIndex: number;
        batchIndex: number;
      };
      context?: string;
    }
  | {
      kind: EventKind.sellOrderCancelled;
      data: {
        orderId: string;
        transactionHash: string;
        logIndex: number;
        batchIndex: number;
      };
      context?: string;
    }
  | {
      kind: EventKind.buyOrderCancelled;
      data: {
        orderId: string;
        transactionHash: string;
        logIndex: number;
        batchIndex: number;
      };
      context?: string;
    };

export class ProcessActivityEventJob extends AbstractRabbitMqJobHandler {
  queueName = "process-activity-event-queue";
  maxRetries = 10;
  concurrency = 15;
  persistent = true;
  lazyMode = true;

  protected async process(payload: ProcessActivityEventJobPayload) {
    const { kind, data } = payload;

    const pendingActivitiesQueue = new PendingActivitiesQueue();

    let eventHandler;

    switch (kind) {
      case EventKind.fillEvent:
        eventHandler = new FillEventCreatedEventHandler(
          data.transactionHash,
          data.logIndex,
          data.batchIndex
        );
        break;
      case EventKind.nftTransferEvent:
        await new PendingActivityEventsQueue(EventKind.nftTransferEvent).add([
          {
            kind: EventKind.nftTransferEvent,
            data: {
              txHash: data.transactionHash,
              logIndex: data.logIndex,
              batchIndex: data.batchIndex,
            } as NftTransferEventInfo,
          },
        ]);

        return;
      case EventKind.newSellOrder:
        eventHandler = new AskCreatedEventHandler(
          data.orderId,
          data.transactionHash,
          data.logIndex,
          data.batchIndex
        );
        break;
      case EventKind.newBuyOrder:
        eventHandler = new BidCreatedEventHandler(
          data.orderId,
          data.transactionHash,
          data.logIndex,
          data.batchIndex
        );
        break;
      case EventKind.buyOrderCancelled:
        eventHandler = new BidCancelledEventHandler(
          data.orderId,
          data.transactionHash,
          data.logIndex,
          data.batchIndex
        );
        break;
      case EventKind.sellOrderCancelled:
        eventHandler = new AskCancelledEventHandler(
          data.orderId,
          data.transactionHash,
          data.logIndex,
          data.batchIndex
        );
        break;
    }

    let activity;

    try {
      activity = await eventHandler.generateActivity();
    } catch (error) {
      logger.error(
        this.queueName,
        JSON.stringify({
          message: `Error generating activity. kind=${kind}, error=${error}`,
          error,
          data,
        })
      );

      throw error;
    }

    if (activity) {
      await pendingActivitiesQueue.add([activity]);
    }
  }

  public async addToQueue(payloads: ProcessActivityEventJobPayload[]) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.sendBatch(payloads.map((payload) => ({ payload })));
  }
}

export const processActivityEventJob = new ProcessActivityEventJob();
