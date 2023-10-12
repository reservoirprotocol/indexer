import {
  saleWebsocketEventsTriggerQueueJob,
  SaleWebsocketEventInfo,
} from "@/jobs/websocket-events/sale-websocket-events-trigger-job";

import {
  askWebsocketEventsTriggerQueueJob,
  OrderWebsocketEventInfo,
} from "@/jobs/websocket-events/ask-websocket-events-trigger-job";

import { bidWebsocketEventsTriggerQueueJob } from "@/jobs/websocket-events/bid-websocket-events-trigger-job";

import {
  transferWebsocketEventsTriggerQueueJob,
  TransferWebsocketEventInfo,
} from "@/jobs/websocket-events/transfer-websocket-events-trigger-job";
import {
  tokenWebsocketEventsTriggerJob,
  TokenCDCEventInfo,
} from "@/jobs/websocket-events/token-websocket-events-trigger-job";
import {
  collectionWebsocketEventsTriggerQueueJob,
  CollectionWebsocketEventInfo,
} from "@/jobs/websocket-events/collection-websocket-events-trigger-job";
import {
  tokenAttributeWebsocketEventsTriggerQueueJob,
  TokenAttributeWebsocketEventInfo,
} from "@/jobs/websocket-events/token-attribute-websocket-events-trigger-job";
import {
  TopBidWebsocketEventInfo,
  topBidWebSocketEventsTriggerJob,
} from "@/jobs/websocket-events/top-bid-websocket-events-trigger-job";

export const WebsocketEventRouter = async ({
  eventKind,
  eventInfo,
}: {
  eventKind: WebsocketEventKind;
  eventInfo: EventInfo;
}) => {
  switch (eventKind) {
    case WebsocketEventKind.SellOrder:
      await askWebsocketEventsTriggerQueueJob.addToQueue([
        {
          data: eventInfo as OrderWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.BuyOrder:
      await bidWebsocketEventsTriggerQueueJob.addToQueue([
        {
          data: eventInfo as OrderWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.TransferEvent:
      await transferWebsocketEventsTriggerQueueJob.addToQueue([
        {
          data: eventInfo as TransferWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.SaleEvent:
      await saleWebsocketEventsTriggerQueueJob.addToQueue([
        {
          data: eventInfo as SaleWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.NewTopBid:
      await topBidWebSocketEventsTriggerJob.addToQueue([
        {
          data: eventInfo as TopBidWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.TokenEvent:
      await tokenWebsocketEventsTriggerJob.addToQueue([
        {
          kind: "CDCEvent",
          data: eventInfo as TokenCDCEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.CollectionEvent:
      await collectionWebsocketEventsTriggerQueueJob.addToQueue([
        {
          data: eventInfo as CollectionWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.TokenAttributeEvent:
      await tokenAttributeWebsocketEventsTriggerQueueJob.addToQueue([
        {
          data: eventInfo as TokenAttributeWebsocketEventInfo,
        },
      ]);
      break;
  }
};

export enum WebsocketEventKind {
  NewTopBid = "new-top-bid",
  SellOrder = "sell-order",
  BuyOrder = "buy-order",
  ApprovalEvent = "approval-event",
  BalanceEvent = "balance-event",
  TransferEvent = "transfer-event",
  SaleEvent = "sale-event",
  TokenEvent = "token-event",
  CollectionEvent = "collection-event",
  TokenAttributeEvent = "token-attribute-event",
}

export type EventInfo =
  | TopBidWebsocketEventInfo
  | OrderWebsocketEventInfo
  | SaleWebsocketEventInfo
  | TransferWebsocketEventInfo
  | TokenCDCEventInfo
  | CollectionWebsocketEventInfo
  | TokenAttributeWebsocketEventInfo;
