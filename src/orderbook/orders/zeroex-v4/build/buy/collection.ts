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
}

export const build = async (options: BuildOrderOptions) => {
  try {
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
      // Skip if we cannot retrieve the collection.
      return undefined;
    }

    if (Number(collectionResult.token_count) > config.maxItemsPerBid) {
      // We don't support collection orders on large collections.
      return undefined;
    }

    const buildInfo = await utils.getBuildInfo(
      {
        ...options,
        contract: fromBuffer(collectionResult.contract),
      },
      options.collection,
      "buy"
    );
    if (!buildInfo) {
      // Skip if we cannot generate the build information.
      return undefined;
    }

    if (!options.excludeFlaggedTokens) {
      let builder: BaseBuilder | undefined;
      if (buildInfo.kind === "erc721") {
        builder = collectionResult.token_set_id.startsWith("contract:")
          ? new Sdk.ZeroExV4.Builders.ContractWide(config.chainId)
          : new Sdk.ZeroExV4.Builders.TokenRange(config.chainId);
      } else if (buildInfo.kind === "erc1155") {
        builder = collectionResult.token_set_id.startsWith("contract:")
          ? new Sdk.ZeroExV4.Builders.ContractWide(config.chainId)
          : new Sdk.ZeroExV4.Builders.TokenRange(config.chainId);
      }

      if (!collectionResult.token_set_id.startsWith("contract:")) {
        const [, , startTokenId, endTokenId] = collectionResult.token_set_id.split(":");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (buildInfo.params as any).startTokenId = startTokenId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (buildInfo.params as any).endTokenId = endTokenId;
      }

      return builder?.build(buildInfo.params);
    } else {
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
    }
  } catch (error) {
    logger.error("zeroex-v4-build-buy-collection-order", `Failed to build order: ${error}`);
    return undefined;
  }
};
