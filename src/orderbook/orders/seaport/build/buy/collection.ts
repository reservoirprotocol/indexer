import * as Sdk from "@reservoir0x/sdk";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers";
import { BaseBuilder } from "@reservoir0x/sdk/dist/seaport/builders/base";

import { redb } from "@/common/db";
import { redis } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/seaport/build/utils";
import { generateSchemaHash } from "@/orderbook/orders/utils";

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

  const buildInfo = await utils.getBuildInfo(
    {
      ...options,
      contract: fromBuffer(collectionResult.contract),
    },
    options.collection,
    "buy"
  );

  const collectionIsContractWide = collectionResult.token_set_id.startsWith("contract:");
  if (!options.excludeFlaggedTokens && collectionIsContractWide) {
    // Use contract-wide order
    const builder: BaseBuilder = new Sdk.Seaport.Builders.ContractWide(config.chainId);
    return builder?.build(buildInfo.params);
  } else {
    // Use token-list order

    // For up-to-date results we need to compute the corresponding token set id
    // from the tokens table. However, that can be computationally-expensive so
    // we go through two levels of caches before performing the computation.
    let cachedMerkleRoot: string | null = null;

    if (options.excludeFlaggedTokens) {
      // Attempt 1: fetch the token set id for non-flagged tokens directly from the collections
      const result = await redb.oneOrNone(
        `
          SELECT
            collections.non_flagged_token_set_id
          FROM collections
          WHERE collections.id = $/id/
        `,
        { id: collectionResult.id }
      );
      if (result?.non_flagged_token_set_id) {
        cachedMerkleRoot = result?.non_flagged_token_set_id;
      }
    }

    // Build the resulting token set's schema
    const schema = {
      kind: options.excludeFlaggedTokens ? "collection-non-flagged" : "collection",
      data: {
        collection: collectionResult.id,
      },
    };
    const schemaHash = generateSchemaHash(schema);

    if (!cachedMerkleRoot) {
      // Attempt 2: use a cached version of the token set
      cachedMerkleRoot = await redis.get(schemaHash);
    }

    if (!cachedMerkleRoot) {
      // Attempt 3 (final - will definitely work): compute the token set id (can be computationally-expensive)

      // Fetch all relevant tokens from the collection
      const tokens = await redb.manyOrNone(
        `
          SELECT
            tokens.token_id
          FROM tokens
          WHERE tokens.collection_id = $/collection/
          ${options.excludeFlaggedTokens ? "AND tokens.is_flagged = 0" : ""}
        `,
        { collection: options.collection }
      );

      // Also cache the computation for one hour
      cachedMerkleRoot = generateMerkleTree(tokens.map(({ token_id }) => token_id)).getHexRoot();
      await redis.set(schemaHash, cachedMerkleRoot, "ex", 3600);
    }

    const builder: BaseBuilder = new Sdk.Seaport.Builders.TokenList(config.chainId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).merkleRoot = cachedMerkleRoot;

    return builder?.build(buildInfo.params);
  }
};
