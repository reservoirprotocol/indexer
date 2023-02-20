export type OrderKind = "single-token" | "contract-wide";

export type MakerOrderParams = {
  kind?: OrderKind;
  isOrderAsk: boolean;
  signer: string;
  collection: string;
  price: string;
  tokenId: string;
  amount: string;
  strategy: string;
  currency: string;
  nonce: string;
  startTime: number;
  endTime: number;
  minPercentageToAsk: number;
  params: string;
  v?: number;
  r?: string;
  s?: string;
};

export type TakerOrderParams = {
  isOrderAsk: boolean;
  taker: string;
  price: string;
  tokenId: string;
  minPercentageToAsk: number;
  params: string;
};
