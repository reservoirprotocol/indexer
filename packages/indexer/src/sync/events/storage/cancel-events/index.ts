import { BaseEventParams } from "@/events-sync/parser";
import { OrderKind } from "@/orderbook/orders";

export * from "@/events-sync/storage/cancel-events/common";
export * from "@/events-sync/storage/cancel-events/on-chain";

export type Event = {
  orderKind: OrderKind;
  orderId: string;
  baseEventParams: BaseEventParams;
};

export type DbEvent = {
  address: Buffer;
  block: number;
  block_hash: Buffer;
  tx_hash: Buffer;
  tx_index: number;
  log_index: number;
  timestamp: number;
  order_kind: OrderKind;
  order_id: string;
};
