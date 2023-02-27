import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/seaport-v1.4/builders/base";

import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/seaport-v1.4/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  contract: string;
  tokenId: string;
}

export const build = async (options: BuildOrderOptions) => {
  const excludeFlaggedTokens = options.excludeFlaggedTokens
    ? "AND (tokens.is_flagged = 0 OR tokens.is_flagged IS NULL)"
    : "";

  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        tokens.collection_id
      FROM tokens
      WHERE tokens.contract = $/contract/
      AND tokens.token_id = $/tokenId/
      ${excludeFlaggedTokens}
    `,
    {
      contract: toBuffer(options.contract),
      tokenId: options.tokenId,
    }
  );
  if (!collectionResult) {
    throw new Error("Could not retrieve token's collection");
  }

  const buildInfo = await utils.getBuildInfo(options, collectionResult.collection_id, "buy");

  const builder: BaseBuilder = new Sdk.SeaportV14.Builders.SingleToken(config.chainId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (buildInfo.params as any).tokenId = options.tokenId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (buildInfo.params as any).amount = options.quantity;

  return builder?.build(buildInfo.params);
};
