import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/wyvern-v2.3/builders/base";

import { edb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  weiPrice: string;
  orderbook: "reservoir" | "opensea";
  fee?: number;
  feeRecipient?: string;
  listingTime?: number;
  expirationTime?: number;
  salt?: string;
  automatedRoyalties?: boolean;
  excludeFlaggedTokens?: boolean;
}

type OrderBuildInfo = {
  params: BaseBuildParams;
  kind: "erc721" | "erc1155";
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: "sell" | "buy"
): Promise<OrderBuildInfo | undefined> => {
  const exchange = new Sdk.WyvernV23.Exchange(config.chainId);

  const buildParams: BaseBuildParams = {
    maker: options.maker,
    side,
    price: options.weiPrice,
    paymentToken:
      side === "sell"
        ? Sdk.Common.Addresses.Eth[config.chainId]
        : Sdk.Common.Addresses.Weth[config.chainId],
    fee: options.fee || 0,
    feeRecipient: options.feeRecipient || options.maker,
    listingTime: options.listingTime,
    expirationTime: options.expirationTime,
    salt: options.salt,
    nonce: (await exchange.getNonce(baseProvider, options.maker)).toString(),
  };

  if (options.automatedRoyalties) {
    const royaltiesResult = await edb.oneOrNone(
      `
        SELECT "c"."royalties" FROM "collections" "c"
        WHERE "c"."id" = $/collection/
      `,
      { collection }
    );

    if (!royaltiesResult) {
      // Skip if royalties could not be retrieved
      return undefined;
    }

    // Use the first royalty information
    const firstRoyalty = royaltiesResult.royalties[0];
    buildParams.fee = firstRoyalty.bps;
    if (firstRoyalty.recipient) {
      buildParams.feeRecipient = firstRoyalty.recipient;
    }

    // All OpenSea orders have a marketplace fee of 2.5%
    if (options.orderbook === "opensea") {
      buildParams.fee += 250;
      buildParams.feeRecipient = "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073";
    }
  }

  const kindResult = await edb.oneOrNone(
    `
      SELECT "c"."kind" FROM "tokens" "t"
      JOIN "contracts" "c"
        ON "t"."contract" = "c"."address"
      WHERE "t"."collection_id" = $/collection/
      LIMIT 1
    `,
    { collection }
  );

  if (!kindResult) {
    // Skip if we cannot detect the kind of the associated contract
    return undefined;
  }

  return {
    params: buildParams,
    kind: kindResult.kind,
  };
};
