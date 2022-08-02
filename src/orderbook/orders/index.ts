export * as foundation from "@/orderbook/orders/foundation";
export * as looksRare from "@/orderbook/orders/looks-rare";
export * as openDao from "@/orderbook/orders/opendao";
export * as seaport from "@/orderbook/orders/seaport";
export * as x2y2 from "@/orderbook/orders/x2y2";
export * as zeroExV4 from "@/orderbook/orders/zeroex-v4";

export type OrderKind =
  | "wyvern-v2"
  | "wyvern-v2.3"
  | "looks-rare"
  | "zeroex-v4-erc721"
  | "zeroex-v4-erc1155"
  | "opendao-erc721"
  | "opendao-erc1155"
  | "foundation"
  | "x2y2"
  | "seaport"
  | "rarible"
  | "element-erc721"
  | "element-erc1155";
