import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/zeroex-v4/builders/base";

import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/zeroex-v4/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
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
      contract: toBuffer(options.contract!),
      tokenId: options.tokenId,
    }
  );

  if (!collectionResult) {
    throw new Error("Could not fetch token's collection");
  }

  const buildInfo = await utils.getBuildInfo(options, collectionResult.collection_id, "buy");
  if (!buildInfo) {
    throw new Error("Could not generate build info");
  }

  const builder: BaseBuilder = new Sdk.ZeroExV4.Builders.SingleToken(config.chainId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (buildInfo.params as any).tokenId = options.tokenId;

  return builder?.build(buildInfo.params);
};
