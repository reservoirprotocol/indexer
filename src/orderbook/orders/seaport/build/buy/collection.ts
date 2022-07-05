import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/seaport/builders/base";

import { edb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/seaport/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  collection: string;
}

export const build = async (options: BuildOrderOptions) => {
  const collectionResult = await edb.oneOrNone(
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
    throw new Error("Could not retrieve token's collection");
  }

  if (Number(collectionResult.token_count) > config.maxItemsPerBid) {
    throw new Error("Collection has too many items");
  }

  const buildInfo = await utils.getBuildInfo(
    {
      ...options,
      contract: fromBuffer(collectionResult.contract),
    },
    options.collection,
    "buy"
  );

  if (!options.excludeFlaggedTokens) {
    // Use contract-wide/token-range order

    if (!collectionResult.token_set_id.startsWith("contract:")) {
      throw new Error("Token range collections are not supported");
    }

    const builder: BaseBuilder = new Sdk.Seaport.Builders.ContractWide(config.chainId);
    return builder?.build(buildInfo.params);
  } else {
    // Use token-list order

    // Fetch all non-flagged tokens from the collection
    // TODO: Include `NOT is_flagged` filter in the query
    const tokens = await edb.manyOrNone(
      `
        SELECT
          tokens.token_id
        FROM tokens
        WHERE tokens.collection_id = $/collection/
      `,
      {
        collection: options.collection,
      }
    );

    const builder: BaseBuilder = new Sdk.Seaport.Builders.TokenList(config.chainId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).tokenIds = tokens.map(({ token_id }) => token_id);

    return builder?.build(buildInfo.params);
  }
};
