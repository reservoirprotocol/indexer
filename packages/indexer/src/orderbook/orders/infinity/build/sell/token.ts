import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/infinity/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  contract: string;
  tokenId: string;
}

export const build = async (options: BuildOrderOptions) => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        collections.id
      FROM collections
      WHERE collections.id = $/collection/
    `,
    {
      collection: options.contract,
    }
  );

  if (!collectionResult?.id) {
    // Skip if the collection is not available or not supported (eg. range or list collection)
    throw new Error("Could not fetch collection");
  }

  const buildInfo = await utils.getBuildInfo({ ...options }, "sell");
  if (!buildInfo) {
    throw new Error("Could not generate build info");
  }

  const builder = new Sdk.Infinity.Builders.SingleToken(config.chainId);
  return builder.build({
    ...buildInfo.params,
    tokenId: options.tokenId,
    collection: options.contract,
    numTokens: 1,
  });
};
