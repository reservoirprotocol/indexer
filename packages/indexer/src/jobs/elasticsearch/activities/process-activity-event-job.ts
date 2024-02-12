import { config } from "@/config/index";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { PendingActivityEventsQueue } from "@/elasticsearch/indexes/activities/pending-activity-events-queue";
import {
  NftTransferEventInfo,
  OrderEventInfo,
} from "@/elasticsearch/indexes/activities/event-handlers/base";

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
      data: OrderEventInfo;
      context?: string;
    }
  | {
      kind: EventKind.newBuyOrder;
      data: OrderEventInfo;
      context?: string;
    }
  | {
      kind: EventKind.nftTransferEvent;
      data: NftTransferEventInfo;
      context?: string;
    }
  | {
      kind: EventKind.fillEvent;
      data: NftTransferEventInfo;
      context?: string;
    }
  | {
      kind: EventKind.sellOrderCancelled;
      data: OrderEventInfo;
      context?: string;
    }
  | {
      kind: EventKind.buyOrderCancelled;
      data: OrderEventInfo;
      context?: string;
    };

export class ProcessActivityEventJob extends AbstractRabbitMqJobHandler {
  queueName = "process-activity-event-queue";
  maxRetries = 10;
  concurrency = 15;
  persistent = true;

  public async process(payload: ProcessActivityEventJobPayload) {
    const { kind, data } = payload;

    switch (kind) {
      case EventKind.fillEvent:
        await new PendingActivityEventsQueue(EventKind.fillEvent).add([
          {
            kind: EventKind.fillEvent,
            data: {
              txHash: data.txHash ?? data.transactionHash,
              logIndex: data.logIndex,
              batchIndex: data.batchIndex,
            } as NftTransferEventInfo,
          },
        ]);

        break;
      case EventKind.nftTransferEvent:
        await new PendingActivityEventsQueue(EventKind.nftTransferEvent).add([
          {
            kind: EventKind.nftTransferEvent,
            data: {
              txHash: data.txHash ?? data.transactionHash,
              logIndex: data.logIndex,
              batchIndex: data.batchIndex,
            } as NftTransferEventInfo,
          },
        ]);

        break;
      case EventKind.newSellOrder:
        await new PendingActivityEventsQueue(EventKind.newSellOrder).add([
          {
            kind: EventKind.newSellOrder,
            data: {
              orderId: data.orderId,
              txHash: data.txHash ?? data.transactionHash,
              logIndex: data.logIndex,
              batchIndex: data.batchIndex,
            } as OrderEventInfo,
          },
        ]);

        break;
      case EventKind.newBuyOrder:
        await new PendingActivityEventsQueue(EventKind.newBuyOrder).add([
          {
            kind: EventKind.newBuyOrder,
            data: {
              orderId: data.orderId,
              txHash: data.txHash ?? data.transactionHash,
              logIndex: data.logIndex,
              batchIndex: data.batchIndex,
            } as OrderEventInfo,
          },
        ]);

        break;
      case EventKind.buyOrderCancelled:
        await new PendingActivityEventsQueue(EventKind.buyOrderCancelled).add([
          {
            kind: EventKind.buyOrderCancelled,
            data: {
              orderId: data.orderId,
              txHash: data.txHash ?? data.transactionHash,
              logIndex: data.logIndex,
              batchIndex: data.batchIndex,
            } as OrderEventInfo,
          },
        ]);

        break;
      case EventKind.sellOrderCancelled:
        await new PendingActivityEventsQueue(EventKind.sellOrderCancelled).add([
          {
            kind: EventKind.sellOrderCancelled,
            data: {
              orderId: data.orderId,
              txHash: data.txHash ?? data.transactionHash,
              logIndex: data.logIndex,
              batchIndex: data.batchIndex,
            } as OrderEventInfo,
          },
        ]);

        break;
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
