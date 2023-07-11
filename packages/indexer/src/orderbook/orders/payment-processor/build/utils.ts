import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/payment-processor/builders/base";

import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

export interface BaseOrderBuildOptions {
  maker: string;
  contract?: string;
  weiPrice: string;
  listingTime?: number;
  expirationTime?: number;
  quantity?: number;
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
    // Skip if we cannot retrieve the collection
    throw new Error("Could not fetch token collection");
  }

  const buildParams: BaseBuildParams = {
    protocol:
      collectionResult.kind === "erc721"
        ? Sdk.PaymentProcessor.Types.TokenProtocols.ERC721
        : Sdk.PaymentProcessor.Types.TokenProtocols.ERC1155,
    marketplace: AddressZero,
    amount: options.quantity ?? "1",
    marketplaceFeeNumerator: "0",
    maxRoyaltyFeeNumerator: "0",
    trader: options.maker,
    tokenAddress: fromBuffer(collectionResult.address),
    price: options.weiPrice,
    expiration: options.expirationTime!,
    coin:
      side === "sell"
        ? Sdk.Common.Addresses.Eth[config.chainId]
        : Sdk.Common.Addresses.Weth[config.chainId],
    masterNonce: await commonHelpers.getMinNonce("payment-processor", options.maker),
  };

  return {
    params: buildParams,
  };
};
