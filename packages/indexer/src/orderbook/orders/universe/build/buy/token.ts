import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/universe/builders/base";

import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/universe/build/utils";

export const build = async (options: utils.BaseOrderBuildOptions) => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        tokens.collection_id
      FROM tokens
      WHERE tokens.contract = $/contract/
        AND tokens.token_id = $/tokenId/
    `,
    {
      contract: toBuffer(options.contract),
      tokenId: options.tokenId,
    }
  );
  if (!collectionResult) {
    throw new Error("Could not fetch token's collection");
  }

  const buildInfo = await utils.getBuildInfo(
    options,
    collectionResult.collection_id,
    Sdk.Universe.Types.OrderSide.BUY
  );
  if (!buildInfo) {
    throw new Error("Could not generate build info");
  }

  const builder: BaseBuilder = new Sdk.Universe.Builders.SingleToken(config.chainId);
  return builder.build(buildInfo.params);
};
