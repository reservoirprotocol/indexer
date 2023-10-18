import * as Sdk from "@reservoir0x/sdk";
import { BigNumberish } from "@ethersproject/bignumber";

import { redb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getBuildInfo } from "@/orderbook/orders/seaport-v1.5/build/utils";
import { BaseOrderBuildOptions } from "@/orderbook/orders/seaport-base/build/utils";
import * as OpenSeaApi from "@/jobs/orderbook/post-order-external/api/opensea";

interface BuildOrderOptions extends BaseOrderBuildOptions {
  // TODO: refactor
  // The following combinations are possible:
  // - collection + attributes
  // - tokenSetId
  tokenSetId?: string;
  collection?: string;
  attributes?: { key: string; value: string }[];
}

export const build = async (options: BuildOrderOptions) => {
  const builder = new Sdk.SeaportBase.Builders.TokenList(config.chainId);

  if (options.collection && options.attributes) {
    let merkleRoot;
    let tokenIds: BigNumberish[] = [];
    if (options.attributes.length !== 1) {
      throw new Error("Attribute bids must be on a single attribute");
    }

    const attributeResult = await redb.oneOrNone(
      `
        SELECT
          collections.contract,
          collections.slug AS "collectionSlug",
          attributes.token_count
        FROM attributes
        JOIN attribute_keys
          ON attributes.attribute_key_id = attribute_keys.id
        JOIN collections
          ON attribute_keys.collection_id = collections.id
        WHERE attribute_keys.collection_id = $/collection/
          AND attribute_keys.key = $/key/
          AND attributes.value = $/value/
      `,
      {
        collection: options.collection,
        key: options.attributes[0].key,
        value: options.attributes[0].value,
      }
    );
    if (!attributeResult) {
      throw new Error("Could not retrieve attribute info");
    }

    if (Number(attributeResult.token_count) > config.maxTokenSetSize) {
      throw new Error("Attribute has too many items");
    }

    const buildInfo = await getBuildInfo(
      {
        ...options,
        contract: fromBuffer(attributeResult.contract),
      },
      options.collection,
      "buy"
    );

    if (options.orderbook === "opensea") {
      const buildCollectionOfferParams = await OpenSeaApi.buildTraitOffer(
        options.maker,
        options.quantity || 1,
        attributeResult.collectionSlug,
        options.attributes[0].key,
        options.attributes[0].value
      );

      // Use the zone returned from OpenSea's API
      buildInfo.params.zone = buildCollectionOfferParams.partialParameters.zone;

      // When cross-posting to OpenSea, if the result from their API is not
      // a contract-wide order, then switch to using a token-list builder
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      merkleRoot =
        buildCollectionOfferParams.partialParameters.consideration[0].identifierOrCriteria;
    } else {
      const excludeFlaggedTokens = options.excludeFlaggedTokens
        ? "AND (tokens.is_flagged = 0 OR tokens.is_flagged IS NULL)"
        : "";

      // Fetch all tokens matching the attributes
      const tokens = await redb.manyOrNone(
        `
          SELECT
            token_attributes.token_id
          FROM token_attributes
          JOIN attributes
            ON token_attributes.attribute_id = attributes.id
          JOIN attribute_keys
            ON attributes.attribute_key_id = attribute_keys.id
          JOIN tokens
            ON token_attributes.contract = tokens.contract
            AND token_attributes.token_id = tokens.token_id
          WHERE attribute_keys.collection_id = $/collection/
            AND attribute_keys.key = $/key/
            AND attributes.value = $/value/
            ${excludeFlaggedTokens}
          ORDER BY token_attributes.token_id
        `,
        {
          collection: options.collection,
          key: options.attributes[0].key,
          value: options.attributes[0].value,
        }
      );

      tokenIds = tokens.map(({ token_id }) => token_id);
    }

    return builder?.build({ ...buildInfo.params, tokenIds, merkleRoot }, Sdk.SeaportV15.Order);
  } else {
    // Fetch all tokens matching the token set
    const tokens = await redb.manyOrNone(
      `
        SELECT
          token_sets_tokens.contract,
          token_sets_tokens.token_id
        FROM token_sets_tokens
        WHERE token_sets_tokens.token_set_id = $/tokenSetId/
      `,
      {
        tokenSetId: options.tokenSetId!,
      }
    );

    const buildInfo = await getBuildInfo(
      {
        ...options,
        contract: fromBuffer(tokens[0].contract),
      },
      fromBuffer(tokens[0].contract),
      "buy"
    );

    const tokenIds = tokens.map(({ token_id }) => token_id);

    return builder?.build({ ...buildInfo.params, tokenIds }, Sdk.SeaportV15.Order);
  }
};
