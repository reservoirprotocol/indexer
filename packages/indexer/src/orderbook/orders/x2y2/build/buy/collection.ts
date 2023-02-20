import * as Sdk from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { redb } from "@/common/db";
import * as utils from "@/orderbook/orders/x2y2/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  collection: string;
}

export const build = async (options: BuildOrderOptions) => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        collections.token_set_id,
        collections.token_count,
        collections.contract
      FROM collections
      WHERE collections.id = $/collection/
    `,
    { collection: options.collection }
  );
  if (!collectionResult) {
    throw new Error("Could not retrieve collection");
  }
  if (Number(collectionResult.token_count) > config.maxTokenSetSize) {
    throw new Error("Collection has too many items");
  }

  const buildInfo = await utils.getBuildInfo(options, options.collection, "buy");
  return Sdk.X2Y2.Builders.CollectionWideBuilder.buildOrder(buildInfo.params);
};
