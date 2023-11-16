import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/payment-processor-v2/builders/base";

import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { getRoyalties } from "@/utils/royalties";

export interface BaseOrderBuildOptions {
  maker: string;
  contract?: string;
  currency?: string;
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

  const contract = fromBuffer(collectionResult.address);
  const buildParams: BaseBuildParams = {
    protocol:
      collectionResult.kind === "erc721"
        ? Sdk.PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL
        : Sdk.PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_PARTIAL,
    marketplace: AddressZero,
    amount: options.quantity ?? "1",
    marketplaceFeeNumerator: "0",
    maxRoyaltyFeeNumerator: await getRoyalties(contract, undefined, "onchain").then((royalties) =>
      royalties.map((r) => r.bps).reduce((a, b) => a + b, 0)
    ),
    maker: options.maker,
    tokenAddress: contract,
    itemPrice: options.weiPrice,
    expiration: options.expirationTime!,
    paymentMethod:
      options.currency ??
      (side === "sell"
        ? Sdk.Common.Addresses.Native[config.chainId]
        : Sdk.Common.Addresses.WNative[config.chainId]),
    masterNonce: await commonHelpers.getMinNonce("payment-processor-v2", options.maker),
  };

  return {
    params: buildParams,
  };
};
