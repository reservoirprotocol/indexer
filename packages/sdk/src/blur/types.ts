export type OrderKind = "erc721-single-token";

export enum TradeDirection {
  BUY,
  SELL,
}

export enum SignatureVersion {
  SINGLE,
  BULK,
}

export type BaseOrder = {
  kind?: OrderKind;
  trader: string;
  side: TradeDirection;
  matchingPolicy: string;
  collection: string;
  tokenId: string;
  amount: string;
  paymentToken: string;
  price: string;
  nonce: string;
  listingTime: string;
  expirationTime: string;
  fees: {
    rate: number;
    recipient: string;
  }[];
  salt: string;
  extraParams: string;
  extraSignature: string;
  signatureVersion: SignatureVersion;
  v?: number;
  r?: string;
  s?: string;
};

export type BlurBidPricePoint = {
  price: string;
  executableSize: number;
  bidderCount: number;
};

// Blur bids require special handling since we can't get the order data for all of them
export type BlurBidPool = {
  collection: string;
  pricePoints: BlurBidPricePoint[];
  attribute?: {
    key: string;
    value: string;
  };
};
