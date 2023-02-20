export type OrderKind = "erc721-single-token";

export enum TradeDirection {
  BUY,
  SELL,
}

export type BaseOrder = {
  kind?: OrderKind;
  side: TradeDirection;
  trader: string;
  collection: string;
  matchingPolicy: string;
  tokenId: string;
  amount: string;
  paymentToken: string;
  nonce: string;
  price: string;
  listingTime: string;
  expirationTime: string;
  fees: {
    rate: number;
    recipient: string;
  }[];
  salt: string;
  extraParams: string;
  extraSignature: string;

  signatureVersion?: number;
  blockNumber: number;
  v?: number;
  r?: string;
  s?: string;
};

export type OrderInput = {
  order: BaseOrder;
  v?: number;
  r?: string;
  s?: string;
  extraSignature: string;
  signatureVersion: number;
  blockNumber: number;
};
