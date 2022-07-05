import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/wyvern-v2.3/builders/base";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/wyvern-v2.3/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  collection: string;
}

export const build = async (options: BuildOrderOptions) => {
  try {
    const collectionResult = await edb.oneOrNone(
      `
        SELECT "token_set_id", "token_count" FROM "collections"
        WHERE "id" = $/collection/
      `,
      {
        collection: options.collection,
      }
    );

    if (!collectionResult) {
      // Skip if we cannot retrieve the collection
      return undefined;
    }

    if (Number(collectionResult.token_count) > config.maxItemsPerBid) {
      // We don't support collection orders on large collections
      return undefined;
    }

    const buildInfo = await utils.getBuildInfo(options, options.collection, "buy");
    if (!buildInfo) {
      // Skip if we cannot generate the build information
      return undefined;
    }

    if (!options.excludeFlaggedTokens) {
      let builder: BaseBuilder | undefined;
      if (buildInfo.kind === "erc721") {
        builder = collectionResult.token_set_id.startsWith("contract:")
          ? new Sdk.WyvernV23.Builders.Erc721.ContractWide(config.chainId)
          : new Sdk.WyvernV23.Builders.Erc721.TokenRange(config.chainId);
      } else if (buildInfo.kind === "erc1155") {
        builder = collectionResult.token_set_id.startsWith("contract:")
          ? new Sdk.WyvernV23.Builders.Erc1155.ContractWide(config.chainId)
          : new Sdk.WyvernV23.Builders.Erc1155.TokenRange(config.chainId);
      }

      if (collectionResult.token_set_id.startsWith("contract:")) {
        const [, contract] = collectionResult.token_set_id.split(":");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (buildInfo.params as any).contract = contract;
      } else {
        const [, contract, startTokenId, endTokenId] = collectionResult.token_set_id.split(":");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (buildInfo.params as any).contract = contract;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (buildInfo.params as any).startTokenId = startTokenId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (buildInfo.params as any).endTokenId = endTokenId;
      }

      return builder?.build(buildInfo.params);
    } else {
      const [, contract] = collectionResult.token_set_id.split(":");

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

      let builder: BaseBuilder | undefined;
      if (buildInfo.kind === "erc721") {
        builder = new Sdk.WyvernV23.Builders.Erc721.TokenList(config.chainId);
      } else if (buildInfo.kind === "erc1155") {
        builder = new Sdk.WyvernV23.Builders.Erc1155.TokenList(config.chainId);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (buildInfo.params as any).contract = contract;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (buildInfo.params as any).tokenIds = tokens.map(({ token_id }) => token_id);

      return builder?.build(buildInfo.params);
    }
  } catch (error) {
    logger.error("wyvern-v2.3-build-buy-collection-order", `Failed to build order: ${error}`);
    return undefined;
  }
};
