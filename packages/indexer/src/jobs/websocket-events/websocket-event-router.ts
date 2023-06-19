import * as saleWebsocketEventsTriggerQueue from "@/jobs/websocket-events/sale-websocket-events-trigger-queue";

import * as bidWebsocketEventsTriggerQueue from "@/jobs/websocket-events/bid-websocket-events-trigger-queue";

import * as approvalWebsocketEventsTriggerQueue from "@/jobs/websocket-events/approval-websocket-events-trigger-queue";
import * as transferWebsocketEventsTriggerQueue from "@/jobs/websocket-events/transfer-websocket-events-trigger-queue";
import * as tokenWebsocketEventsTriggerQueue from "@/jobs/websocket-events/token-websocket-events-trigger-queue";
import * as topBidWebsocketEventsTriggerQueue from "@/jobs/websocket-events/top-bid-websocket-events-trigger-queue";
import * as askWebsocketEventsTriggerQueue from "@/jobs/websocket-events/ask-websocket-events-trigger-queue";
import * as collectionWebsocketEventsTriggerQueue from "@/jobs/websocket-events/collection-websocket-events-trigger-queue";

export const WebsocketEventRouter = async ({
  eventKind,
  eventInfo,
}: {
  eventKind: WebsocketEventKind;
  eventInfo: EventInfo;
}) => {
  switch (eventKind) {
    case WebsocketEventKind.SellOrder:
      await askWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as askWebsocketEventsTriggerQueue.AskWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.BuyOrder:
      await bidWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as bidWebsocketEventsTriggerQueue.BidWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.ApprovalEvent:
      await approvalWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as approvalWebsocketEventsTriggerQueue.ApprovalWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.TransferEvent:
      await transferWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as transferWebsocketEventsTriggerQueue.TransferWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.SaleEvent:
      await saleWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as saleWebsocketEventsTriggerQueue.SaleWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.NewTopBid:
      await topBidWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as topBidWebsocketEventsTriggerQueue.TopBidWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.TokenEvent:
      await tokenWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as tokenWebsocketEventsTriggerQueue.TokenWebsocketEventInfo,
        },
      ]);
      break;
    case WebsocketEventKind.CollectionEvent:
      await collectionWebsocketEventsTriggerQueue.addToQueue([
        {
          data: eventInfo as collectionWebsocketEventsTriggerQueue.CollectionWebsocketEventInfo,
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
}

export type EventInfo =
  | topBidWebsocketEventsTriggerQueue.TopBidWebsocketEventInfo
  | askWebsocketEventsTriggerQueue.AskWebsocketEventInfo
  | bidWebsocketEventsTriggerQueue.BidWebsocketEventInfo
  | approvalWebsocketEventsTriggerQueue.ApprovalWebsocketEventInfo
  | transferWebsocketEventsTriggerQueue.TransferWebsocketEventInfo
  | saleWebsocketEventsTriggerQueue.SaleWebsocketEventInfo
  | tokenWebsocketEventsTriggerQueue.TokenWebsocketEventInfo
  | collectionWebsocketEventsTriggerQueue.CollectionWebsocketEventInfo;
