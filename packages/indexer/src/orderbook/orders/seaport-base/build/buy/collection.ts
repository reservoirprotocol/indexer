import * as Sdk from "@reservoir0x/sdk";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers";

import { redb } from "@/common/db";
import { redis } from "@/common/redis";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as OpenSeaApi from "@/jobs/orderbook/post-order-external/api/opensea";
import { Tokens } from "@/models/tokens";
import { BaseOrderBuildOptions, OrderBuildInfo } from "@/orderbook/orders/seaport-base/build/utils";
import { generateSchemaHash } from "@/orderbook/orders/utils";

export interface BuildOrderOptions extends BaseOrderBuildOptions {
  collection: string;
}

export class BuyCollectionBuilderBase {
  private getBuildInfoFunc: (
    options: BaseOrderBuildOptions,
    collection: string,
    side: "sell" | "buy"
  ) => Promise<OrderBuildInfo>;

  constructor(
    getBuildInfoFunc: (
      options: BaseOrderBuildOptions,
      collection: string,
      side: "sell" | "buy"
    ) => Promise<OrderBuildInfo>
  ) {
    this.getBuildInfoFunc = getBuildInfoFunc;
  }

  public async build<T extends Sdk.SeaportBase.IOrder>(
    options: BuildOrderOptions,
    orderBuilder: { new (chainId: number, params: Sdk.SeaportBase.Types.OrderComponents): T }
  ): Promise<T> {
    const collectionResult = await redb.oneOrNone(
      `
        SELECT
          collections.token_set_id,
          collections.token_count,
          collections.contract,
          collections.slug
        FROM collections
        WHERE collections.id = $/collection/
      `,
      { collection: options.collection }
    );
    if (!collectionResult) {
      throw new Error("Could not retrieve collection");
    }

    if (Number(collectionResult.token_count) > config.maxTokenSetSize) {
      throw new Error("Collection has too many tokens");
    }

    const buildInfo = await this.getBuildInfoFunc(
      {
        ...options,
        contract: fromBuffer(collectionResult.contract),
      },
      options.collection,
      "buy"
    );

    const collectionIsContractWide = collectionResult.token_set_id?.startsWith("contract:");
    if (collectionIsContractWide && !options.excludeFlaggedTokens) {
      // By default, use a contract-wide builder
      let builder: Sdk.SeaportBase.BaseBuilder = new Sdk.SeaportBase.Builders.ContractWide(
        config.chainId
      );

      if (options.orderbook === "opensea") {
        const buildCollectionOfferParams = await OpenSeaApi.buildCollectionOffer(
          options.maker,
          options.quantity || 1,
          collectionResult.slug
        );

        // Use the zone returned from OpenSea's API
        buildInfo.params.zone = buildCollectionOfferParams.partialParameters.zone;

        // When cross-posting to OpenSea, if the result from their API is not
        // a contract-wide order, then switch to using a token-list builder
        if (
          buildCollectionOfferParams.partialParameters.consideration[0].identifierOrCriteria != "0"
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (buildInfo.params as any).merkleRoot =
            buildCollectionOfferParams.partialParameters.consideration[0].identifierOrCriteria;

          builder = new Sdk.SeaportBase.Builders.TokenList(config.chainId);
        }
      }

      return builder.build(buildInfo.params, orderBuilder);
    } else {
      // Use a token-list builder
      const builder: Sdk.SeaportBase.BaseBuilder = new Sdk.SeaportBase.Builders.TokenList(
        config.chainId
      );

      if (options.orderbook === "opensea") {
        // We need to fetch from OpenSea the most up-to-date merkle root
        // (currently only supported on production APIs)
        const buildCollectionOfferParams = await OpenSeaApi.buildCollectionOffer(
          options.maker,
          options.quantity || 1,
          collectionResult.slug
        );

        // Use the zone returned from OpenSea's API
        buildInfo.params.zone = buildCollectionOfferParams.partialParameters.zone;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (buildInfo.params as any).merkleRoot =
          buildCollectionOfferParams.partialParameters.consideration[0].identifierOrCriteria;
      } else {
        // For up-to-date results we need to compute the corresponding token set id
        // from the tokens table. However, that can be computationally-expensive so
        // we go through two levels of caches before performing the computation.
        let cachedMerkleRoot: string | null = null;

        // Build the resulting token set's schema
        const schema = {
          kind: options.excludeFlaggedTokens ? "collection-non-flagged" : "collection",
          data: {
            collection: options.collection,
          },
        };
        const schemaHash = generateSchemaHash(schema);

        if (!cachedMerkleRoot) {
          // Attempt 1: use a cached version of the token set
          cachedMerkleRoot = await redis.get(schemaHash);
        }

        if (!cachedMerkleRoot) {
          // Attempt 2 (final - will definitely work): compute the token set id (can be computationally-expensive)

          // Fetch all relevant tokens from the collection
          const tokenIds = await Tokens.getTokenIdsInCollection(
            options.collection,
            "",
            options.excludeFlaggedTokens
          );

          // Also cache the computation for one hour
          cachedMerkleRoot = generateMerkleTree(tokenIds).getHexRoot();
          await redis.set(schemaHash, cachedMerkleRoot, "EX", 3600);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (buildInfo.params as any).merkleRoot = cachedMerkleRoot;
      }

      return builder.build(buildInfo.params, orderBuilder);
    }
  }
}
