import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import * as utils from "@/orderbook/orders/x2y2/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  tokenId: string;
}

export const build = async (options: BuildOrderOptions) => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        tokens.collection_id
      FROM tokens
      WHERE tokens.contract = $/contract/
        AND tokens.token_id = $/tokenId/
    `,
    {
      contract: toBuffer(options.contract!),
      tokenId: options.tokenId,
    }
  );
  if (!collectionResult) {
    throw new Error("Could not retrieve token's collection");
  }

  const buildInfo = await utils.getBuildInfo(options, collectionResult.collection_id, "buy");
  return Sdk.X2Y2.Builders.SingleTokenBuilder.buildOrder({
    ...buildInfo.params,
    tokenId: options.tokenId,
  });
};
