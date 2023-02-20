import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/forward/builders/base";

import { redb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { now } from "@/common/utils";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  contract: string;
  weiPrice: string;
  quantity?: number;
  nonce?: string;
  expirationTime?: number;
  salt?: string;
  excludeFlaggedTokens?: boolean;
}

type OrderBuildInfo = {
  params: BaseBuildParams;
  kind: "erc721" | "erc1155";
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string
): Promise<OrderBuildInfo> => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
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

  const exchange = new Sdk.Forward.Exchange(config.chainId);

  const buildParams: BaseBuildParams = {
    maker: options.maker,
    tokenKind: collectionResult.kind,
    contract: options.contract,
    unitPrice: options.weiPrice,
    expiration: options.expirationTime || now() + 3600,
    salt: options.salt,
    counter: (await exchange.getCounter(baseProvider, options.maker)).toString(),
  };

  return {
    params: buildParams,
    kind: collectionResult.kind,
  };
};
