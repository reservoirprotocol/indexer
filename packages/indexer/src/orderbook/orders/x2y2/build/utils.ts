import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/x2y2/builders/base";

import { redb } from "@/common/db";
import { fromBuffer, now } from "@/common/utils";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  contract?: string;
  weiPrice: string;
  orderbook: "x2y2";
  expirationTime?: number;
  salt?: string;
}

type OrderBuildInfo = {
  params: BaseBuildParams;
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: "sell" | "buy"
): Promise<OrderBuildInfo> => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        contracts.address,
        contracts.kind
      FROM collections
      JOIN contracts
        ON collections.contract = contracts.address
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection }
  );
  if (!collectionResult) {
    throw new Error("Could not fetch collection");
  }
  if (collectionResult.kind !== "erc721") {
    throw new Error("X2Y2 only supports ERC721 orders");
  }

  const buildParams: BaseBuildParams = {
    user: options.maker,
    network: config.chainId,
    side,
    contract: fromBuffer(collectionResult.address),
    price: options.weiPrice,
    currency:
      side === "buy"
        ? Sdk.Common.Addresses.Weth[config.chainId]
        : Sdk.Common.Addresses.Eth[config.chainId],
    deadline: options.expirationTime || now() + 24 * 3600,
    salt: options.salt?.toString(),
  };

  return {
    params: buildParams,
  };
};
