export const ORDER_DATA = "ORDER_DATA";
export const DATA_TYPE_0X = "0x";
// export const RARIBLE_TYPE = "RARIBLE_V1";

//TODO: These should be an enum
// export const RARIBLE_ORDER_TYPE_V1 = "V1";
// export const RARIBLE_ORDER_TYPE_V2 = "V2";
// export const RARIBLE_ORDER_TYPE_V3_SELL = "V3_SELL";
// export const RARIBLE_ORDER_TYPE_V3_BUY = "V3_BUY";

export enum ORDER_DATA_TYPES {
  DEFAULT_DATA_TYPE = "0xffffffff",
  LEGACY = "LEGACY",
  V1 = "V1",
  API_V1 = "ETH_RARIBLE_V1",
  V2 = "V2",
  API_V2 = "ETH_RARIBLE_V2",
  V3_SELL = "V3_SELL",
  API_V3_SELL = "ETH_RARIBLE_V2_DATA_V3_SELL",
  V3_BUY = "V3_BUY",
  API_V3_BUY = "ETH_RARIBLE_V2_DATA_V3_BUY",
}

export enum ORDER_TYPES {
  V1 = "RARIBLE_V1",
  V2 = "RARIBLE_V2",
}
