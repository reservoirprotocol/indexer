import * as Sdk from "@reservoir0x/sdk";
import { OrderSide } from "@reservoir0x/sdk/dist/universe/types";

import { redb } from "@/common/db";
import { now } from "@/common/utils";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  tokenId: string;
  quantity?: number;
  salt?: string;
  currency?: string;
  nftAssetClass?: string;
  weiPrice: string;
  listingTime?: number;
  expirationTime?: number;
  signature?: string;
  fees: string[];
}

type OrderBuildInfo = {
  params: Sdk.Universe.Types.BaseBuildParams;
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: Sdk.Universe.Types.OrderSide
): Promise<OrderBuildInfo> => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        contracts.kind,
        contracts.address
      FROM collections
      JOIN contracts
        ON collections.contract = contracts.address
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection }
  );
  if (!collectionResult) {
    // Skip if we cannot retrieve the collection
    throw new Error("Could not fetch token collection");
  }

  if (collectionResult.kind !== "erc721" && collectionResult.kind !== "erc1155") {
    throw new Error("Invalid NFT asset class");
  }

  const params: Sdk.Universe.Types.BaseBuildParams = {
    maker: options.maker,
    side: side === OrderSide.BUY ? "buy" : "sell",
    tokenKind: collectionResult.kind,
    contract: options.contract,
    tokenId: options.tokenId,
    tokenAmount: options.quantity,
    price: options.weiPrice,
    paymentToken: options.currency ?? Sdk.Common.Addresses.Eth[config.chainId],
    fees: options.fees,
    startTime: options.listingTime ?? now() - 60,
    endTime: options.expirationTime ?? now() + 3600,
  };
  return {
    params,
  };
};
