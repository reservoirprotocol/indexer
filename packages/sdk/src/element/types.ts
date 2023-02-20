export type OrderKind =
  | "erc721-single-token"
  | "erc1155-single-token"
  | "erc721-contract-wide"
  | "erc1155-contract-wide";

export enum TradeDirection {
  SELL,
  BUY,
}

export type BaseOrder = {
  kind?: OrderKind;
  direction: TradeDirection;
  maker: string;
  taker: string;
  expiry: string;
  nonce: string;
  erc20Token: string;
  erc20TokenAmount: string;
  fees: {
    recipient: string;
    amount: string;
    feeData: string;
  }[];
  nft: string;
  nftId: string;
  hashNonce: string;
  nftProperties: {
    propertyValidator: string;
    propertyData: string;
  }[];
  nftAmount?: string;
  signatureType?: number;
  v?: number;
  r?: string;
  s?: string;
};

export type Collection = {
  nftAddress: string;
  platformFee: number;
  royaltyFeeRecipient: string;
  royaltyFee: number;
  items: {
    erc20TokenAmount: string;
    nftId: string;
  }[];
};

export type BatchSignedOrder = {
  maker: string;
  listingTime: number;
  expirationTime: number;
  startNonce: number;
  erc20Token: string;
  platformFeeRecipient: string;
  basicCollections: Collection[];
  collections: Collection[];
  hashNonce: string;
  hash: string;
  v: number;
  r: string;
  s: string;
  nonce: number;
  nft?: string;
  nftId?: string;
  erc20TokenAmount?: string;
  platformFee?: number;
  royaltyFeeRecipient?: string;
  royaltyFee?: number;
};

export type MatchParams = {
  nftId?: string;
  nftAmount?: string;
  unwrapNativeToken?: boolean;
};
