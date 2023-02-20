import { TypedDataDomain, TypedDataField } from "ethers";
import { Order } from "./order";

export type OrderNFTs = {
  collection: string;
  tokens: { tokenId: string; numTokens: number }[];
};

export type OrderKind = "contract-wide" | "single-token" | "complex";

export interface OrderInput {
  isSellOrder: boolean;
  signer: string;
  numItems: number;
  startPrice: string;
  endPrice: string;
  startTime: number;
  endTime: number;
  nonce: string;
  maxGasPrice: string;
  nfts: OrderNFTs[];
  complication: string;
  extraParams: string;
  currency: string;
  trustedExecution: string;
  signature?:
    | string
    | {
        r: string;
        s: string;
        v: number;
      };
}

export type InternalOrder = {
  isSellOrder: boolean;
  signer: string;
  constraints: string[];
  nfts: OrderNFTs[];
  execParams: string[];
  extraParams: string;
};

export type SignedOrder = InternalOrder & {
  sig: string;
};

export type TakeOrderParams = {
  order: Order;
  tokens: OrderNFTs[];
};

export interface SignatureData {
  signatureKind: "eip712";
  domain: TypedDataDomain;
  type: Record<string, TypedDataField[]>;
  value: InternalOrder;
}
