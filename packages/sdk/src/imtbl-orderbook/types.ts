import { ItemType, OrderType } from "../seaport-base/types";

export type OrderbookOrderInput = {
  order_hash: string;
  account_address: string;
  buy: Array<BuySellItem>;
  fees: Array<FeeItem>;
  start_at: string; // "2022-03-10T05:00:50.52Z";
  end_at: string;
  protocol_data: ProtocolData;
  salt: string;
  sell: Array<BuySellItem>;
  signature: string;
};

export type OrderbookOrder = OrderbookOrderInput & {
  id: string;
  chain: {
    id: string;
    name: string;
  };
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  type: "LISTING";
};

export type OrderbookFulfillmentData = {
  extra_data: string;
  order: OrderbookOrder;
};

export type OrderbookFulfillmentResponse = {
  result: {
    fulfillable_orders: OrderbookFulfillmentData[];
    unfulfillable_orders: { order_id: string; reason: string }[];
  };
};

export interface ListingsResult {
  page: {
    previousCursor: string | null;
    nextCursor: string | null;
  };
  result: OrderbookOrder[];
}

export enum ItemTypeString {
  NATIVE = "NATIVE",
  ERC20 = "ERC20",
  ERC721 = "ERC721",
  ERC1155 = "ERC1155",
  ERC721_WITH_CRITERIA = "ERC721_WITH_CRITERIA",
  ERC1155_WITH_CRITERIA = "ERC1155_WITH_CRITERIA",
}

export const ITEM_TYPE_STRING_TO_INT: Record<string, ItemType> = {
  NATIVE: ItemType.NATIVE,
  ERC20: ItemType.ERC20,
  ERC721: ItemType.ERC721,
  ERC1155: ItemType.ERC1155,
  ERC721_WITH_CRITERIA: ItemType.ERC721_WITH_CRITERIA,
  ERC1155_WITH_CRITERIA: ItemType.ERC1155_WITH_CRITERIA,
};

export const ITEM_TYPE_INT_TO_STRING: Record<number, ItemTypeString> = {
  0: ItemTypeString.NATIVE,
  1: ItemTypeString.ERC20,
  2: ItemTypeString.ERC721,
  3: ItemTypeString.ERC1155,
  4: ItemTypeString.ERC721_WITH_CRITERIA,
  5: ItemTypeString.ERC1155_WITH_CRITERIA,
};

export enum OrderTypeString {
  FULL_OPEN = "FULL_OPEN",
  PARTIAL_OPEN = "PARTIAL_OPEN",
  FULL_RESTRICTED = "FULL_RESTRICTED",
  PARTIAL_RESTRICTED = "PARTIAL_RESTRICTED",
  CONTRACT = "CONTRACT",
}

export const ORDER_TYPE_STRING_TO_INT: Record<string, OrderType> = {
  FULL_OPEN: OrderType.FULL_OPEN,
  PARTIAL_OPEN: OrderType.PARTIAL_OPEN,
  FULL_RESTRICTED: OrderType.FULL_RESTRICTED,
  PARTIAL_RESTRICTED: OrderType.PARTIAL_RESTRICTED,
  CONTRACT: OrderType.CONTRACT,
};

export const ORDER_TYPE_INT_TO_STRING: Record<number, OrderTypeString> = {
  0: OrderTypeString.FULL_OPEN,
  1: OrderTypeString.PARTIAL_OPEN,
  2: OrderTypeString.FULL_RESTRICTED,
  3: OrderTypeString.PARTIAL_RESTRICTED,
  4: OrderTypeString.CONTRACT,
};

export type BuySellItem = {
  type: ItemTypeString;
  contract_address?: string;
  token_id?: string;
  amount?: string;
};

export type ProtocolData = {
  order_type: OrderTypeString;
  zone_address: string;
  counter: string;
  seaport_address: string;
  seaport_version: string;
};

export enum FeeType {
  ROYALTY = "ROYALTY",
  MAKER_ECOSYSTEM = "MAKER_ECOSYSTEM",
  TAKER_ECOSYSTEM = "TAKER_ECOSYSTEM",
  PROTOCOL = "PROTOCOL",
}

export type FeeItem = {
  amount: string;
  type: FeeType;
  recipient_address: string;
};

export enum OrderStatusName {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  FILLED = "FILLED",
  EXPIRED = "EXPIRED",
  CANCELLED = "CANCELLED",
}

type ActiveOrderStatus = {
  name: OrderStatusName.ACTIVE;
};

type CancelledOrderStatus = {
  name: OrderStatusName.CANCELLED;
  pending: boolean;
  cancellation_type: CancellationType;
};

enum CancellationType {
  ON_CHAIN = "ON_CHAIN",
  OFF_CHAIN = "OFF_CHAIN",
}

type ExpiredOrderStatus = {
  name: OrderStatusName.EXPIRED;
};

type FilledOrderStatus = {
  name: OrderStatusName.FILLED;
};

type InactiveOrderStatus = {
  name: OrderStatusName.INACTIVE;
  sufficient_approvals: boolean;
  sufficient_balances: boolean;
};

type PendingOrderStatus = {
  name: OrderStatusName.PENDING;
  evaluated: boolean;
  started: boolean;
};

export type OrderStatus =
  | CancelledOrderStatus
  | PendingOrderStatus
  | ActiveOrderStatus
  | InactiveOrderStatus
  | FilledOrderStatus
  | ExpiredOrderStatus;
