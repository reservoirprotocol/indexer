import { logger } from "@/common/logger";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivitiesQueue } from "@/elasticsearch/indexes/activities/queue";
import { FillEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/fill-event-created";
import { NftTransferEventCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/nft-transfer-event-created";
import { AskCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-created";
import { BidCreatedEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/bid-created";
import { BidCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/bid-cancelled";
import { AskCancelledEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/ask-cancelled";

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
        eventHandler = new NftTransferEventCreatedEventHandler(
          data.transactionHash,
          data.logIndex,
          data.batchIndex
        );
        break;
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
        `failed to generate elastic activity error ${error} data ${JSON.stringify(data)}`
      );
    }

    if (activity) {
      await pendingActivitiesQueue.add([activity]);
    }
  }

  public async addToQueue(payloads: ProcessActivityEventJobPayload[]) {
    await this.sendBatch(payloads.map((payload) => ({ payload })));
  }
}

export const processActivityEventJob = new ProcessActivityEventJob();
