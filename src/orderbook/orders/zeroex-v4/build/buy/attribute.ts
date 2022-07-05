import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/zeroex-v4/builders/base";
import { getBitVectorCalldataSize } from "@reservoir0x/sdk/dist/common/helpers/bit-vector";
import { getPackedListCalldataSize } from "@reservoir0x/sdk/dist/common/helpers/packed-list";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/zeroex-v4/build/utils";

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

    if (!attributeResult.token_count) {
      // Skip if we cannot retrieve the collection
      return undefined;
    }

    if (Number(attributeResult.token_count) > config.maxItemsPerBid) {
      // We don't support attribute orders on large token sets
      return undefined;
    }

    const buildInfo = await utils.getBuildInfo(
      {
        ...options,
        contract: fromBuffer(attributeResult.contract),
      },
      options.collection,
      "buy"
    );
    if (!buildInfo) {
      // Skip if we cannot generate the build information
      return undefined;
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
        ORDER BY "ta"."token_id"
      `,
      {
        collection: options.collection,
        key: options.attributes[0].key,
        value: options.attributes[0].value,
      }
    );

    const tokenIds = tokens.map(({ token_id }) => token_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).tokenIds = tokenIds;

    // TODO: De-duplicate code

    // Choose the most gas-efficient method for checking (bit vector vs packed list)
    let bitVectorCost = -1;
    if (bn(tokenIds[tokenIds.length - 1]).lte(200000)) {
      bitVectorCost = getBitVectorCalldataSize(tokenIds.map(Number));
    }
    const packedListCost = getPackedListCalldataSize(tokenIds);

    // If the calldata exceeds ~50.000 bytes we simply revert
    const costThreshold = 100000;

    let builder: BaseBuilder | undefined;
    if (bitVectorCost == -1 || bitVectorCost > packedListCost) {
      if (packedListCost > costThreshold) {
        throw new Error("Cost too high");
      }

      if (buildInfo.kind === "erc721") {
        builder = new Sdk.ZeroExV4.Builders.TokenList.PackedList(config.chainId);
      } else if (buildInfo.kind === "erc1155") {
        builder = new Sdk.ZeroExV4.Builders.TokenList.PackedList(config.chainId);
      }
    } else {
      if (bitVectorCost > costThreshold) {
        throw new Error("Cost too high");
      }

      if (buildInfo.kind === "erc721") {
        builder = new Sdk.ZeroExV4.Builders.TokenList.BitVector(config.chainId);
      } else if (buildInfo.kind === "erc1155") {
        builder = new Sdk.ZeroExV4.Builders.TokenList.BitVector(config.chainId);
      }
    }

    return builder?.build(buildInfo.params);
  } catch (error) {
    logger.error("zeroex-v4-build-buy-attribute-order", `Failed to build order: ${error}`);
    return undefined;
  }
};
