import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/x2y2/builders/base";

import { redb } from "@/common/db";
import { fromBuffer, now } from "@/common/utils";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  contract?: string;
  taker?: string;
  weiPrice: string;
  quantity?: number;
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

  const buildParams: BaseBuildParams = {
    user: options.maker,
    network: config.chainId,
    side,
    contract: fromBuffer(collectionResult.address),
    price: options.weiPrice,
    amount: options.quantity,
    taker: options.taker,
    delegateType:
      collectionResult.kind === "erc721"
        ? Sdk.X2Y2.Types.DelegationType.ERC721
        : Sdk.X2Y2.Types.DelegationType.ERC1155,
    currency:
      side === "buy"
        ? Sdk.Common.Addresses.WNative[config.chainId]
        : Sdk.Common.Addresses.Native[config.chainId],
    deadline: options.expirationTime || now() + 24 * 3600,
    salt: options.salt?.toString(),
  };

  return {
    params: buildParams,
  };
};
