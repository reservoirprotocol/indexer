import * as Sdk from "@reservoir0x/sdk";
import { generateSourceBytes } from "@reservoir0x/sdk/dist/utils";

import { bn } from "@/common/utils";

export interface BaseOrderBuildOptions {
  maker: string;
  contract?: string;
  weiPrice: string;
  orderbook: "opensea" | "reservoir";
  useOffChainCancellation?: boolean;
  replaceOrderId?: string;
  orderType?: Sdk.SeaportBase.Types.OrderType;
  currency?: string;
  quantity?: number;
  nonce?: string;
  fee?: number[];
  feeRecipient?: string[];
  listingTime?: number;
  expirationTime?: number;
  salt?: string;
  automatedRoyalties?: boolean;
  royaltyBps?: number;
  excludeFlaggedTokens?: boolean;
  source?: string;
  orderbookApiKey?: string;
}

export type OrderBuildInfo = {
  params: Sdk.SeaportBase.BaseBuildParams;
  kind: "erc721" | "erc1155";
};

export const padSourceToSalt = (source: string, salt: string) => {
  const sourceHash = generateSourceBytes(source);
  const saltHex = bn(salt)._hex.slice(6);
  return bn(`0x${sourceHash}${saltHex}`).toString();
};
