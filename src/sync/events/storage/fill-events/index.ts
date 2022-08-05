import { BaseEventParams } from "@/events-sync/parser";
import { OrderKind } from "@/orderbook/orders";

export * from "@/events-sync/storage/fill-events/common";
export * from "@/events-sync/storage/fill-events/partial";
export * from "@/events-sync/storage/fill-events/foundation";

export type Event = {
  orderKind: OrderKind;
  orderId?: string;
  orderSide: "buy" | "sell";
  orderSourceIdInt?: number;
  maker: string;
  taker: string;
  price: string;
  contract: string;
  tokenId: string;
  amount: string;
  aggregatorSourceId?: number;
  fillSourceId?: number;
  washTradingScore?: number;
  currency: string;
  currencyPrice?: string;
  usdPrice?: string;
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
  batch_index: number;
  order_kind: OrderKind;
  order_id: string | null;
  order_side: "buy" | "sell";
  order_source_id_int: number | null;
  maker: Buffer;
  taker: Buffer;
  price: string;
  contract: Buffer;
  token_id: string;
  amount: string;
  aggregator_source_id: number | null;
  fill_source_id: number | null;
  wash_trading_score: number;
  currency: Buffer;
  currency_price: string | null;
  usd_price: string | null;
};
