import { BigNumberish } from "ethers";

export enum AssetClass {
  ERC20 = "ERC20",
  ETH = "ETH",
  ERC721 = "ERC721",
  ERC1155 = "ERC1155",
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
};

export type LocalAsset = {
  assetType: LocalAssetType;
  value: string;
};

export type OrderKind = "single-token";

export type Order = {
  kind?: OrderKind;
  type: string;
  maker: string;
  make: LocalAsset;
  taker: string;
  take: LocalAsset;
  salt: string;
  start: number;
  end: number;
  data: IOrderData;
  signature?: string;
};

export interface IPart {
  account: string;
  value: string;
}

export interface IOrderData {
  dataType?: string;
  revenueSplits?: IPart[];
}

export type TakerOrderParams = {
  type: string;
  maker: string;
  taker: string;
  make: Asset;
  take: Asset;
  salt: number;
  start: number;
  end: number;
  data: IOrderData;
};

export interface BaseBuildParams {
  maker: string;
  side: "buy" | "sell";
  tokenKind: "erc721" | "erc1155";
  contract: string;
  tokenId: string;
  tokenAmount?: number;
  price: string;
  paymentToken: string;
  fees: string[];
  salt?: BigNumberish;
  startTime: number;
  endTime: number;
}
