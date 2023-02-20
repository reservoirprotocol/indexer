import { BigNumberish } from "ethers";
import { ORDER_DATA_TYPES, ORDER_TYPES } from "./constants";

export const EIP712_TYPES = {
  AssetType: [
    { name: "assetClass", type: "bytes4" },
    { name: "data", type: "bytes" },
  ],
  Asset: [
    { name: "assetType", type: "AssetType" },
    { name: "value", type: "uint256" },
  ],
  Order: [
    { name: "maker", type: "address" },
    { name: "makeAsset", type: "Asset" },
    { name: "taker", type: "address" },
    { name: "takeAsset", type: "Asset" },
    { name: "salt", type: "uint256" },
    { name: "start", type: "uint256" },
    { name: "end", type: "uint256" },
    { name: "dataType", type: "bytes4" },
    { name: "data", type: "bytes" },
  ],
};

export enum AssetClass {
  ERC20 = "ERC20",
  ETH = "ETH",
  ERC721 = "ERC721",
  ERC1155 = "ERC1155",
  COLLECTION = "COLLECTION",
  ERC721_LAZY = "ERC721_LAZY",
  ERC1155_LAZY = "ERC1155_LAZY",
}

export enum OrderSide {
  BUY,
  SELL,
}

export type AssetType = {
  assetClass: string;
  data: string;
};

export type Asset = {
  assetType: AssetType;
  value: string;
};

export type LocalAssetType = {
  assetClass: string;
  contract?: string;
  tokenId?: string;
  uri?: string;
  supply?: string;
  creators?: IPart[];
  royalties?: IPart[];
  signatures?: string[];
};

export type LocalAsset = {
  // Comes from API
  type?: any;
  assetType: LocalAssetType;
  value: string;
};

export type OrderKind = "single-token" | "contract-wide";

export type Order = {
  kind?: OrderKind;
  hash?: string;
  id?: string;
  type: ORDER_TYPES;
  maker: string;
  make: LocalAsset;
  taker: string;
  take: LocalAsset;
  salt: string;
  start: number;
  end: number;
  data:
    | ILegacyOrderData
    | IV1OrderData
    | IV2OrderData
    | IV3OrderSellData
    | IV3OrderBuyData;
  signature?: string;
  side?: string;
  createdAt?: string;
  endedAt?: string;
  amount?: number;
};

export type Purchase = {
  sellOrderMaker: string;
  sellOrderNftAmount: string;
  nftAssetClass: string;
  nftData: string;
  sellOrderPaymentAmount: string;
  paymentToken: string;
  sellOrderSalt: string;
  sellOrderStart: number;
  sellOrderEnd: number;
  sellOrderDataType: string;
  sellOrderData: string;
  sellOrderSignature: string;
  buyOrderPaymentAmount: string;
  buyOrderNftAmount: number;
  buyOrderData: string;
};

/*All accept bid parameters need for create buyOrder and sellOrder*/
export type AcceptBid = {
  bidMaker: string;
  bidNftAmount: string;
  nftAssetClass: string;
  nftData: string;
  bidPaymentAmount: string;
  paymentToken: string;
  bidSalt: string;
  bidStart: number;
  bidEnd: number;
  bidDataType: string;
  bidData: string;
  bidSignature: string;
  sellOrderPaymentAmount: string;
  sellOrderNftAmount: number;
  sellOrderData: string;
};

export interface IPart {
  account: string;
  value: string;
}
export interface ILegacyOrderData {
  "@type"?: string;
  dataType: ORDER_DATA_TYPES;
  fee: number;
}
export interface IV1OrderData {
  "@type"?: string;
  dataType: ORDER_DATA_TYPES;
  payouts: IPart[];
  originFees: IPart[];
}
export interface IV2OrderData {
  "@type"?: string;
  dataType: ORDER_DATA_TYPES;
  payouts: IPart[];
  originFees: IPart[];
}
export interface IV3OrderSellData {
  "@type"?: string;
  dataType: ORDER_DATA_TYPES;
  payouts: IPart;
  originFeeFirst: IPart;
  originFeeSecond: IPart;
  maxFeesBasePoint: number;
  marketplaceMarker: string;
}

export interface IV3OrderBuyData {
  "@type"?: string;
  dataType: ORDER_DATA_TYPES;
  payouts: IPart;
  originFeeFirst: IPart;
  originFeeSecond: IPart;
  marketplaceMarker: string;
}

export type TakerOrderParams = {
  type: string;
  maker: string;
  taker: string;
  make: LocalAsset;
  take: LocalAsset;
  salt: number;
  start: number;
  end: number;
  data:
    | ILegacyOrderData
    | IV1OrderData
    | IV2OrderData
    | IV3OrderSellData
    | IV3OrderBuyData;
};

export interface BaseBuildParams {
  orderType: ORDER_TYPES;
  maker: string;
  side: "buy" | "sell";
  tokenKind: "erc721" | "erc1155" | "erc721_lazy" | "erc1155_lazy";
  contract: string;
  tokenAmount?: number;
  price: string;
  paymentToken: string;
  salt?: BigNumberish;
  startTime: number;
  endTime: number;
  dataType: ORDER_DATA_TYPES;

  // Lazy mint options
  uri?: string;
  supply?: string;
  creators?: IPart[];
  royalties?: IPart[];
  signatures?: string[];
  // Fields below should be based on the data type of the order
  // They are optional currently and we assume they're passed correctly
  // TODO: Validation should be added to ensure correct all params exist and are passed correctly
  originFees?: IPart[];
  payouts?: IPart[];
  originFeeFirst?: IPart;
  originFeeSecond?: IPart;
  marketplaceMarker?: string;
  fee?: number;
  maxFeesBasePoint?: number;
}
