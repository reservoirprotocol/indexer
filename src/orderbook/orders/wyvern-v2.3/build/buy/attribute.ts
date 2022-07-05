import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/wyvern-v2.3/builders/base";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/wyvern-v2.3/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  collection: string;
  attributes: { key: string; value: string }[];
}

export const build = async (options: BuildOrderOptions) => {
  try {
    if (options.attributes.length !== 1) {
      // TODO: Support more than one attribute
      return undefined;
    }

    const attributeResult = await edb.oneOrNone(
      `
        SELECT
          "c"."contract",
          "a"."token_count"
        FROM "attributes" "a"
        JOIN "attribute_keys" "ak"
          ON "a"."attribute_key_id" = "ak"."id"
        JOIN "collections" "c"
          ON "ak"."collection_id" = "c"."id"
        WHERE "ak"."collection_id" = $/collection/
          AND "ak"."key" = $/key/
          AND "a"."value" = $/value/
      `,
      {
        collection: options.collection,
        key: options.attributes[0].key,
        value: options.attributes[0].value,
      }
    );

    if (!attributeResult) {
      // Skip if we cannot retrieve the collection
      return undefined;
    }

    if (Number(attributeResult.token_count) > config.maxItemsPerBid) {
      // We don't support attribute orders on large token sets
      return undefined;
    }

    const buildInfo = await utils.getBuildInfo(options, options.collection, "buy");
    if (!buildInfo) {
      // Skip if we cannot generate the build information
      return undefined;
    }

    let builder: BaseBuilder | undefined;
    if (buildInfo.kind === "erc721") {
      builder = new Sdk.WyvernV23.Builders.Erc721.TokenList(config.chainId);
    } else if (buildInfo.kind === "erc1155") {
      builder = new Sdk.WyvernV23.Builders.Erc1155.TokenList(config.chainId);
    }

    // Fetch all tokens matching the attributes
    // TODO: Include `NOT is_flagged` filter in the query
    const tokens = await edb.manyOrNone(
      `
        SELECT
          "ta"."token_id"
        FROM "token_attributes" "ta"
        JOIN "attributes" "a"
          ON "ta"."attribute_id" = "a"."id"
        JOIN "attribute_keys" "ak"
          ON "a"."attribute_key_id" = "ak"."id"
        WHERE "ak"."collection_id" = $/collection/
          AND "ak"."key" = $/key/
          AND "a"."value" = $/value/
      `,
      {
        collection: options.collection,
        key: options.attributes[0].key,
        value: options.attributes[0].value,
      }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).contract = fromBuffer(attributeResult.contract);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).tokenIds = tokens.map(({ token_id }) => token_id);

    return builder?.build(buildInfo.params);
  } catch (error) {
    logger.error("wyvern-v2.3-build-buy-attribute-order", `Failed to build order: ${error}`);
    return undefined;
  }
};
