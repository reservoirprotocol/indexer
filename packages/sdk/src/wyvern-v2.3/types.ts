export enum OrderHowToCall {
  CALL,
  DELEGATE_CALL,
}

export enum OrderSaleKind {
  FIXED_PRICE,
  DUTCH_AUCTION,
}

export enum OrderSide {
  BUY,
  SELL,
}

export type OrderKind =
  | "erc721-single-token"
  | "erc721-single-token-v2"
  | "erc721-token-range"
  | "erc721-contract-wide"
  | "erc721-token-list"
  | "erc1155-single-token"
  | "erc1155-single-token-v2"
  | "erc1155-token-range"
  | "erc1155-contract-wide"
  | "erc1155-token-list";

export type OrderParams = {
  kind?: OrderKind;
  exchange: string;
  maker: string;
  taker: string;
  makerRelayerFee: number;
  takerRelayerFee: number;
  feeRecipient: string;
  side: OrderSide;
  saleKind: OrderSaleKind;
  target: string;
  howToCall: OrderHowToCall;
  calldata: string;
  replacementPattern: string;
  staticTarget: string;
  staticExtradata: string;
  paymentToken: string;
  basePrice: string;
  extra: string;
  listingTime: number;
  expirationTime: number;
  salt: string;
  nonce: string;
  v?: number;
  r?: string;
  s?: string;
};
