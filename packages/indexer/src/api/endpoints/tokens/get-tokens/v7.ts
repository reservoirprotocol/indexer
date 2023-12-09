/* eslint-disable @typescript-eslint/no-explicit-any */

import { MaxUint256 } from "@ethersproject/constants";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";
import _ from "lodash";
import * as Boom from "@hapi/boom";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  getJoiPriceObject,
  getJoiSaleObject,
  getJoiSourceObject,
  getJoiTokenObject,
  JoiAttributeValue,
  JoiPrice,
  JoiSale,
  JoiSource,
} from "@/common/joi";
import {
  bn,
  buildContinuation,
  formatEth,
  fromBuffer,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { Assets, ImageSize } from "@/utils/assets";
import { CollectionSets } from "@/models/collection-sets";
import { Collections } from "@/models/collections";
import { getListedTokensFromES } from "@/api/endpoints/tokens";

const version = "v7";

export const getTokensV7Options: RouteOptions = {
  description: "Tokens",
  notes:
    "Get a list of tokens with full metadata. This is useful for showing a single token page, or scenarios that require more metadata.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      collectionsSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection set. Example: `8daa732ebe5db23f267e58d52f1c9b1879279bcdf4f78b8fb563390e6946ea65`"
        )
        .when("flagStatus", {
          is: Joi.exist(),
          then: Joi.forbidden(),
          otherwise: Joi.allow(),
        }),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`")
        .when("flagStatus", {
          is: Joi.exist(),
          then: Joi.forbidden(),
          otherwise: Joi.allow(),
        }),
      contract: Joi.alternatives()
        .try(
          Joi.array().items(Joi.string().lowercase().pattern(regex.address)).max(20),
          Joi.string().lowercase().pattern(regex.address)
        )
        .description(
          "Array of contracts. Max amount is 20. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        )
        .when("flagStatus", {
          is: Joi.exist(),
          then: Joi.forbidden(),
          otherwise: Joi.allow(),
        }),
      tokenName: Joi.string()
        .description(
          "Filter to a particular token by name. This is case sensitive. Example: `token #1`"
        )
        .when("collection", {
          is: Joi.exist(),
          then: Joi.allow(),
          otherwise: Joi.when("contract", {
            is: Joi.exist(),
            then: Joi.allow(),
            otherwise: Joi.forbidden(),
          }),
        }),
      tokens: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(Joi.string().lowercase().pattern(regex.token))
          .description(
            "Array of tokens. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          ),
        Joi.string()
          .lowercase()
          .pattern(regex.token)
          .description(
            "Array of tokens. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          )
      ),
      tokenSetId: Joi.string()
        .description(
          "Filter to a particular token set. `Example: token:0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270:129000685`"
        )
        .when("flagStatus", {
          is: Joi.exist(),
          then: Joi.forbidden(),
          otherwise: Joi.allow(),
        }),
      attributes: Joi.object()
        .unknown()
        .description(
          "Filter to a particular attribute. Attributes are case sensitive. Note: Our docs do not support this parameter correctly. To test, you can use the following URL in your browser. Example: `https://api.reservoir.tools/tokens/v6?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attributes[Type]=Original` or `https://api.reservoir.tools/tokens/v6?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attributes[Type]=Original&attributes[Type]=Sibling`"
        ),
      source: Joi.string().description(
        "Domain of the order source. Example `opensea.io` (Only listed tokens are returned when filtering by source)"
      ),
      nativeSource: Joi.string().description(
        "Domain of the order source. Example `www.apecoinmarketplace.com`. For a native marketplace, return all tokens listed on this marketplace, even if better prices are available on other marketplaces."
      ),
      minRarityRank: Joi.number()
        .integer()
        .min(1)
        .description(
          "Get tokens with a min rarity rank (inclusive), no rarity rank for collections over 100k"
        ),
      maxRarityRank: Joi.number()
        .integer()
        .min(1)
        .description(
          "Get tokens with a max rarity rank (inclusive), no rarity rank for collections over 100k"
        ),
      minFloorAskPrice: Joi.number().description(
        "Get tokens with a min floor ask price (inclusive); use native currency"
      ),
      maxFloorAskPrice: Joi.number().description(
        "Get tokens with a max floor ask price (inclusive); use native currency"
      ),
      flagStatus: Joi.number()
        .allow(-1, 0, 1)
        .description(
          "Allowed only with collection and tokens filtering!\n-1 = All tokens (default)\n0 = Non flagged tokens\n1 = Flagged tokens"
        ),
      sortBy: Joi.string()
        .valid("floorAskPrice", "tokenId", "rarity", "updatedAt")
        .default("floorAskPrice")
        .description(
          "Order the items are returned in the response. Options are `floorAskPrice`, `tokenId`, `rarity`, and `updatedAt`. No rarity rank for collections over 100k."
        ),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      currencies: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(Joi.string().lowercase().pattern(regex.address))
          .description(
            "Filter to tokens with a listing in a particular currency. Max limit is 50. `Example: currencies[0]: 0x0000000000000000000000000000000000000000`"
          ),
        Joi.string()
          .lowercase()
          .pattern(regex.address)
          .description(
            "Filter to tokens with a listing in a particular currency. `Example: currencies[0]: 0x0000000000000000000000000000000000000000`"
          )
      ),
      limit: Joi.number()
        .integer()
        .min(1)
        .when("sortBy", {
          is: "updatedAt",
          then: Joi.number().integer().max(1000),
          otherwise: Joi.number().integer().max(100),
        })
        .default(20)
        .description(
          "Amount of items returned in response. Max limit is 100, except when sorting by `updatedAt` which has a limit of 1000."
        ),
      startTimestamp: Joi.number()
        .when("sortBy", {
          is: "updatedAt",
          then: Joi.allow(),
          otherwise: Joi.forbidden(),
        })
        .description(
          "When sorting by `updatedAt`, the start timestamp you want to filter on (UTC)."
        ),
      endTimestamp: Joi.number()
        .when("sortBy", {
          is: "updatedAt",
          then: Joi.allow(),
          otherwise: Joi.forbidden(),
        })
        .description("When sorting by `updatedAt`, the end timestamp you want to filter on (UTC)."),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
      includeMintStages: Joi.boolean()
        .default(false)
        .description("If true, mint data for the tokens will be included in the response."),
      excludeEOA: Joi.boolean()
        .default(false)
        .description(
          "Exclude orders that can only be filled by EOAs, to support filling with smart contracts. defaults to false"
        ),
      excludeSpam: Joi.boolean()
        .default(false)
        .description("If true, will filter any tokens marked as spam."),
      includeAttributes: Joi.boolean()
        .default(false)
        .description("If true, attributes will be returned in the response."),
      includeQuantity: Joi.boolean()
        .default(false)
        .description(
          "If true, quantity filled and quantity remaining will be returned in the response."
        ),
      includeDynamicPricing: Joi.boolean()
        .default(false)
        .description("If true, dynamic pricing data will be returned in the response."),
      includeLastSale: Joi.boolean()
        .default(false)
        .description(
          "If true, last sale data including royalties paid will be returned in the response."
        ),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Input any ERC20 address to return result in given currency. Applies to `topBid` and `floorAsk`."
        ),
    })
      .when(".sortBy", {
        is: "updatedAt",
        then: undefined,
        otherwise: Joi.object().or(
          "collection",
          "contract",
          "tokens",
          "tokenSetId",
          "community",
          "collectionsSetId"
        ),
      })
      .oxor("collection", "contract", "tokens", "tokenSetId", "community", "collectionsSetId")
      .oxor("source", "nativeSource")
      .with("attributes", "collection"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            chainId: Joi.number().required(),
            contract: Joi.string().lowercase().pattern(regex.address).required(),
            tokenId: Joi.string().pattern(regex.number).required(),
            name: Joi.string().allow("", null),
            description: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            imageSmall: Joi.string().allow("", null),
            imageLarge: Joi.string().allow("", null),
            metadata: Joi.object().allow(null),
            media: Joi.string().allow("", null),
            kind: Joi.string().allow("", null).description("Can be erc721, erc115, etc."),
            isFlagged: Joi.boolean().default(false),
            isSpam: Joi.boolean().default(false),
            metadataDisabled: Joi.boolean().default(false),
            lastFlagUpdate: Joi.string().allow("", null),
            lastFlagChange: Joi.string().allow("", null),
            supply: Joi.number()
              .unsafe()
              .allow(null)
              .description("Can be higher than 1 if erc1155"),
            remainingSupply: Joi.number().unsafe().allow(null),
            rarity: Joi.number()
              .unsafe()
              .allow(null)
              .description("No rarity for collections over 100k"),
            rarityRank: Joi.number()
              .unsafe()
              .allow(null)
              .description("No rarity rank for collections over 100k"),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow("", null),
              image: Joi.string().allow("", null),
              slug: Joi.string().allow("", null),
              symbol: Joi.string().allow("", null),
              creator: Joi.string().lowercase().pattern(regex.address).allow("", null),
              tokenCount: Joi.number().allow(null),
              metadataDisabled: Joi.boolean().default(false),
              floorAskPrice: JoiPrice.allow(null).description("Can be null if no active asks."),
            }),
            lastSale: JoiSale.optional(),
            owner: Joi.string().allow(null),
            attributes: Joi.array()
              .items(
                Joi.object({
                  key: Joi.string().description("Case sensitive."),
                  kind: Joi.string().description("Can be `string`, `number`, `date`, or `range`."),
                  value: JoiAttributeValue.description("Case sensitive."),
                  tokenCount: Joi.number(),
                  onSaleCount: Joi.number(),
                  floorAskPrice: Joi.number().unsafe().allow(null),
                  topBidValue: Joi.number().unsafe().allow(null),
                  createdAt: Joi.string(),
                })
              )
              .optional(),
            mintStages: Joi.array().items(
              Joi.object({
                stage: Joi.string().required(),
                tokenId: Joi.string().pattern(regex.number).allow(null),
                kind: Joi.string().required(),
                price: JoiPrice.allow(null),
                startTime: Joi.number().allow(null),
                endTime: Joi.number().allow(null),
                maxMintsPerWallet: Joi.number().unsafe().allow(null),
              })
            ),
          }),
          market: Joi.object({
            floorAsk: {
              id: Joi.string().allow(null),
              price: JoiPrice.allow(null),
              // maker: Joi.string().lowercase().pattern(regex.address).allow(null),
              maker: Joi.string().lowercase().allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
              quantityFilled: Joi.number().unsafe().allow(null),
              quantityRemaining: Joi.number().unsafe().allow(null),
              dynamicPricing: Joi.object({
                kind: Joi.string().valid("dutch", "pool"),
                data: Joi.object(),
              }).description("Can be null if no active ask."),
              source: JoiSource.allow(null),
            },
            topBid: Joi.object({
              id: Joi.string().allow(null),
              price: JoiPrice.allow(null),
              maker: Joi.string().lowercase().pattern(regex.address).allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
              source: JoiSource.allow(null),
              feeBreakdown: Joi.array()
                .items(
                  Joi.object({
                    kind: Joi.string().description("Can be `marketplace` or `royalty`."),
                    recipient: Joi.string().lowercase().pattern(regex.address).allow(null),
                    bps: Joi.number(),
                  })
                )
                .allow(null)
                .description("Can be null if no active bids"),
            }).optional(),
          }),
          updatedAt: Joi.string(),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-tokens-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    let esTokens: any[] = [];

    const enableElasticsearchAsks =
      query.sortBy === "floorAskPrice" &&
      !["tokenName", "tokenSetId"].some((filter) => query[filter]);

    if (enableElasticsearchAsks) {
      logger.info(
        `get-tokens-${version}-handler`,
        JSON.stringify({
          topic: "debugAskIndex",
          message: "Using Elasticsearch for asks",
          query,
        })
      );

      const listedTokens = await getListedTokensFromES(query);

      if (listedTokens.continuation || query.source || query.nativeSource) {
        return { tokens: listedTokens.tokens, continuation: listedTokens.continuation };
      }

      esTokens = listedTokens.tokens;

      query.limit = query.limit - esTokens.length;
      query.excludeEOA = false;
      query.continuation = null;
    }

    // Include attributes
    let selectAttributes = "";
    if (query.includeAttributes) {
      selectAttributes = `
        , (
          SELECT
            array_agg(
              json_build_object(
                'key', ta.key,
                'kind', attributes.kind,
                'value', ta.value,
                'createdAt', ta.created_at,
                'tokenCount', attributes.token_count,
                'onSaleCount', attributes.on_sale_count,
                'floorAskPrice', attributes.floor_sell_value::TEXT,
                'topBidValue', attributes.top_buy_value::TEXT
              )
            )
          FROM token_attributes ta
          JOIN attributes
            ON ta.attribute_id = attributes.id
          WHERE ta.contract = t.contract
            AND ta.token_id = t.token_id
            AND ta.key != ''
        ) AS attributes
      `;
    }

    let selectFloorData: string;
    if (query.normalizeRoyalties) {
      selectFloorData = `
        t.normalized_floor_sell_id AS floor_sell_id,
        t.normalized_floor_sell_maker AS floor_sell_maker,
        t.normalized_floor_sell_valid_from AS floor_sell_valid_from,
        t.normalized_floor_sell_valid_to AS floor_sell_valid_to,
        t.normalized_floor_sell_source_id_int AS floor_sell_source_id_int,
        t.normalized_floor_sell_value AS floor_sell_value,
        t.normalized_floor_sell_currency AS floor_sell_currency,
        t.normalized_floor_sell_currency_value AS floor_sell_currency_value
      `;
    } else {
      selectFloorData = `
        t.floor_sell_id,
        t.floor_sell_maker,
        t.floor_sell_valid_from,
        t.floor_sell_valid_to,
        t.floor_sell_source_id_int,
        t.floor_sell_value,
        t.floor_sell_currency,
        t.floor_sell_currency_value
      `;
    }

    let includeQuantityQuery = "";
    let selectIncludeQuantity = "";
    if (query.includeQuantity) {
      selectIncludeQuantity = ", q.*";
      includeQuantityQuery = `
        LEFT JOIN LATERAL (
          SELECT
            o.quantity_filled AS floor_sell_quantity_filled,
            o.quantity_remaining AS floor_sell_quantity_remaining
          FROM
            orders o
          WHERE
            o.id = t.floor_sell_id
        ) q ON TRUE
      `;
    }

    let includeDynamicPricingQuery = "";
    let selectIncludeDynamicPricing = "";
    if (query.includeDynamicPricing) {
      selectIncludeDynamicPricing = ", d.*";
      includeDynamicPricingQuery = `
        LEFT JOIN LATERAL (
          SELECT
            o.kind AS floor_sell_order_kind,
            o.dynamic AS floor_sell_dynamic,
            o.raw_data AS floor_sell_raw_data,
            o.missing_royalties AS floor_sell_missing_royalties
          FROM orders o
          WHERE o.id = t.floor_sell_id
        ) d ON TRUE
      `;
    }

    let includeRoyaltyBreakdownQuery = "";
    let selectRoyaltyBreakdown = "";
    if (query.includeLastSale) {
      selectRoyaltyBreakdown = ", r.*";
      includeRoyaltyBreakdownQuery = `
        LEFT JOIN LATERAL (
        SELECT
          fe.timestamp AS last_sale_timestamp,
          fe.currency AS last_sale_currency,
          fe.currency_price AS last_sale_currency_price,
          fe.price AS last_sale_price,
          fe.usd_price AS last_sale_usd_price,
          fe.marketplace_fee_bps AS last_sale_marketplace_fee_bps,
          fe.royalty_fee_bps AS last_sale_royalty_fee_bps,
          fe.paid_full_royalty AS last_sale_paid_full_royalty,
          fe.royalty_fee_breakdown AS last_sale_royalty_fee_breakdown,
          fe.marketplace_fee_breakdown AS last_sale_marketplace_fee_breakdown,
          fe.order_source_id_int AS last_sale_order_source_id_int,
          fe.fill_source_id AS last_sale_fill_source_id
        FROM fill_events_2 fe
        WHERE fe.contract = t.contract AND fe.token_id = t.token_id AND fe.is_deleted = 0
        ORDER BY timestamp DESC LIMIT 1
        ) r ON TRUE
        `;
    }

    // Include mint stages
    let mintStagesSelectQuery = "";
    let mintStagesJoinQuery = "";
    if (query.includeMintStages) {
      mintStagesSelectQuery = ", v.*";
      mintStagesJoinQuery = `
        LEFT JOIN LATERAL (
          SELECT
            array_agg(
              json_build_object(
                'stage', collection_mints.stage,
                'tokenId', collection_mints.token_id::TEXT,
                'kind', collection_mints.kind,
                'currency', concat('0x', encode(collection_mints.currency, 'hex')),
                'price', collection_mints.price::TEXT,
                'startTime', floor(extract(epoch from collection_mints.start_time)),
                'endTime', floor(extract(epoch from collection_mints.end_time)),
                'maxMintsPerWallet', collection_mints.max_mints_per_wallet
              )
            ) AS mint_stages
          FROM collection_mints
          WHERE collection_mints.collection_id = t.collection_id
            AND collection_mints.token_id = t.token_id
            AND collection_mints.status = 'open'
        ) v ON TRUE
      `;
    }

    // Get the collections from the collection set or community
    let collections: any[] = [];
    if (query.collectionsSetId) {
      collections = await CollectionSets.getCollectionsIds(query.collectionsSetId);

      if (_.isEmpty(collections)) {
        throw Boom.badRequest(`No collections for collection set ${query.collectionsSetId}`);
      }
    }

    if (query.community) {
      collections = await Collections.getIdsByCommunity(query.community);

      if (_.isEmpty(collections)) {
        throw Boom.badRequest(`No collections for community ${query.community}`);
      }
    }

    let sourceCte = "";
    if (query.nativeSource || query.excludeEOA) {
      const sourceConditions: string[] = [];

      if (query.nativeSource) {
        const sources = await Sources.getInstance();
        let nativeSource = sources.getByName(query.nativeSource, false);
        if (!nativeSource) {
          nativeSource = sources.getByDomain(query.nativeSource, false);
        }

        if (!nativeSource) {
          return {
            tokens: [],
            continuation: null,
          };
        }

        (query as any).nativeSource = nativeSource?.id;
        sourceConditions.push(`source_id_int = $/nativeSource/`);
      }

      selectFloorData = "s.*";

      sourceConditions.push(`side = 'sell'`);
      sourceConditions.push(`fillability_status = 'fillable'`);
      sourceConditions.push(`approval_status = 'approved'`);
      sourceConditions.push(
        `taker = '\\x0000000000000000000000000000000000000000' OR taker IS NULL`
      );

      if (query.excludeEOA) {
        sourceConditions.push(`kind NOT IN ('blur')`);
      }

      if (query.currencies) {
        sourceConditions.push(`currency IN ($/currenciesFilter:raw/)`);
      }

      // Retrieve the contract from the different filters options
      if (query.contract) {
        sourceConditions.push(`contract IN ($/contract:csv/)`);
      } else if (query.collection) {
        let contractString = query.collection;
        if (query.collection.includes(":")) {
          const [contract, ,] = query.collection.split(":");
          contractString = contract;
        }

        (query as any).contract = contractString;
        sourceConditions.push(`contract IN ($/contract:csv/)`);
      } else if (query.tokens) {
        if (!_.isArray(query.tokens)) {
          query.tokens = [query.tokens];
        }

        const tokensContracts = [];
        for (const token of query.tokens) {
          const [contract] = token.split(":");
          tokensContracts.push(contract);
        }

        query.tokensContracts = _.uniq(tokensContracts).map((contract: string) =>
          toBuffer(contract)
        );

        sourceConditions.push("contract IN ($/tokensContracts:csv/)");
      } else if ((query.collectionsSetId || query.community) && !_.isEmpty(collections)) {
        const tokensContracts = [];

        for (const collection of collections) {
          if (collection.includes(":")) {
            const [contract, ,] = collection.split(":");
            tokensContracts.push(contract);
          } else {
            tokensContracts.push(collection);
          }
        }

        query.tokensContracts = _.uniq(tokensContracts).map((contract: string) =>
          toBuffer(contract)
        );

        sourceConditions.push("contract IN ($/tokensContracts:csv/)");
      }

      sourceCte = `
        WITH approved_orders AS (
          SELECT *
          FROM orders
          WHERE ${sourceConditions.map((c) => `(${c})`).join(" AND ")}
        ),
        filtered_orders AS (
          SELECT
            DISTINCT ON (token_id, contract)
            tst.token_id AS token_id,
            tst.contract AS contract,
            o.id AS floor_sell_id,
            o.maker AS floor_sell_maker,
            o.id AS source_floor_sell_id,
            date_part('epoch', lower(o.valid_between)) AS floor_sell_valid_from,
            coalesce(
              nullif(date_part('epoch', upper(o.valid_between)), 'Infinity'),
              0
            ) AS floor_sell_valid_to,
            o.source_id_int AS floor_sell_source_id_int,
            ${
              query.normalizeRoyalties ? "o.normalized_value" : "o.value"
            } AS floor_sell_value, o.currency AS floor_sell_currency,
            ${
              query.normalizeRoyalties ? "o.currency_normalized_value" : "o.currency_value"
            } AS floor_sell_currency_value
          FROM approved_orders o
          JOIN token_sets_tokens tst ON o.token_set_id = tst.token_set_id
          ORDER BY token_id, contract, ${
            query.normalizeRoyalties ? "o.normalized_value" : "o.value"
          }
        )`;
    }

    let collectionFloorAskSelectQuery;

    if (query.normalizeRoyalties) {
      collectionFloorAskSelectQuery = `
          c.normalized_floor_sell_id AS c_floor_sell_id,
          c.normalized_floor_sell_value AS c_floor_sell_value,
          c.normalized_floor_sell_maker AS c_floor_sell_maker,
          least(2147483647::NUMERIC, date_part('epoch', lower(c.normalized_floor_sell_valid_between)))::INT AS c_floor_sell_valid_from,
          least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(c.normalized_floor_sell_valid_between)), 'Infinity'),0))::INT AS c_floor_sell_valid_until,
          c.normalized_floor_sell_source_id_int AS c_floor_sell_source_id_int
        `;
    } else {
      collectionFloorAskSelectQuery = `
          c.floor_sell_id AS c_floor_sell_id,
          c.floor_sell_value AS c_floor_sell_value,
          c.floor_sell_maker AS c_floor_sell_maker,
          least(2147483647::NUMERIC, date_part('epoch', lower(c.floor_sell_valid_between)))::INT AS c_floor_sell_valid_from,
          least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(c.floor_sell_valid_between)), 'Infinity'),0))::INT AS c_floor_sell_valid_until,
          c.floor_sell_source_id_int AS c_floor_sell_source_id_int
        `;
    }

    try {
      let baseQuery = `
        ${sourceCte}
        SELECT
          t.contract AS t_contract,
          t.token_id AS t_token_id,
          t.name,
          t.description,
          t.image,
          t.metadata,
          t.media,
          t.collection_id,
          c.name AS collection_name,
          t.image_version,
          con.kind,
          con.symbol,
          ${selectFloorData},
          t.rarity_score,
          t.rarity_rank,
          t.is_flagged,
          t.is_spam AS t_is_spam,
          t.last_flag_update,
          t.last_flag_change,
          t.supply,
          t.remaining_supply,
          extract(epoch from t.updated_at) AS t_updated_at,
          c.slug,
          c.creator,
          c.token_count,
          c.is_spam AS c_is_spam,
          (c.metadata ->> 'imageUrl')::TEXT AS collection_image,
          (
            SELECT
              nb.owner
            FROM nft_balances nb
            WHERE nb.contract = t.contract
              AND nb.token_id = t.token_id
              AND nb.amount > 0
            LIMIT 1
          ) AS owner,
          ${collectionFloorAskSelectQuery}
          ${selectAttributes}
          ${selectIncludeQuantity}
          ${selectIncludeDynamicPricing}
          ${selectRoyaltyBreakdown}
          ${mintStagesSelectQuery}
        FROM tokens t
        ${
          sourceCte !== ""
            ? `${
                query.excludeEOA ? "LEFT " : ""
              }JOIN filtered_orders s ON s.contract = t.contract AND s.token_id = t.token_id`
            : ""
        }
        ${includeQuantityQuery}
        ${includeDynamicPricingQuery}
        ${includeRoyaltyBreakdownQuery}
        ${mintStagesJoinQuery}
        JOIN collections c ON t.collection_id = c.id ${
          query.excludeSpam ? `AND (c.is_spam IS NULL OR c.is_spam <= 0)` : ""
        }
        JOIN contracts con ON t.contract = con.address
      `;

      if (query.tokenSetId) {
        baseQuery += `
          JOIN token_sets_tokens tst
            ON t.contract = tst.contract
            AND t.token_id = tst.token_id
        `;
      }

      if (query.attributes) {
        const attributes: { key: string; value: any }[] = [];
        Object.entries(query.attributes).forEach(([key, value]) => attributes.push({ key, value }));

        for (let i = 0; i < attributes.length; i++) {
          const multipleSelection = Array.isArray(attributes[i].value);

          (query as any)[`key${i}`] = attributes[i].key;
          (query as any)[`value${i}`] = attributes[i].value;

          baseQuery += `
            JOIN token_attributes ta${i}
              ON t.contract = ta${i}.contract
              AND t.token_id = ta${i}.token_id
              AND ta${i}.key = $/key${i}/
              AND ta${i}.value ${multipleSelection ? `IN ($/value${i}:csv/)` : `= $/value${i}/`}
          `;
        }
      }

      // Filters
      const conditions: string[] = [];
      if (query.collection) {
        (query as any).collectionContract = toBuffer(query.collection.split(":")[0]);
        conditions.push(`t.contract = $/collectionContract/`);

        if (query.collection.includes(":")) {
          conditions.push(`t.collection_id = $/collection/`);
        }
      }

      if (_.indexOf([0, 1], query.flagStatus) !== -1) {
        conditions.push(`t.is_flagged = $/flagStatus/`);
      }

      if (query.contract) {
        if (!Array.isArray(query.contract)) {
          query.contract = [query.contract];
        }
        query.contract = query.contract.map((contract: string) => toBuffer(contract));

        if (query.contract.length == 1) {
          conditions.push(`t.contract IN ($/contract:csv/)`);
        }
      }

      if (query.excludeSpam) {
        conditions.push(`(t.is_spam IS NULL OR t.is_spam <= 0)`);
      }

      if (query.minRarityRank) {
        conditions.push(`t.rarity_rank >= $/minRarityRank/`);
      }

      if (query.maxRarityRank) {
        conditions.push(`t.rarity_rank <= $/maxRarityRank/`);
      }

      if (query.minFloorAskPrice !== undefined) {
        (query as any).minFloorSellValue = query.minFloorAskPrice * 10 ** 18;
        conditions.push(
          `${query.nativeSource || query.excludeEOA ? "s." : "t."}${
            query.normalizeRoyalties ? "normalized_" : ""
          }floor_sell_value >= $/minFloorSellValue/`
        );
      }

      if (query.maxFloorAskPrice !== undefined) {
        (query as any).maxFloorSellValue = query.maxFloorAskPrice * 10 ** 18;
        conditions.push(
          `${query.nativeSource || query.excludeEOA ? "s." : "t."}${
            query.normalizeRoyalties ? "normalized_" : ""
          }floor_sell_value <= $/maxFloorSellValue/`
        );
      }

      if (query.source) {
        const sources = await Sources.getInstance();
        let source = sources.getByName(query.source, false);
        if (!source) {
          source = sources.getByDomain(query.source);
        }

        (query as any).source = source?.id;
        conditions.push(`t.floor_sell_source_id_int = $/source/`);
      }

      if (query.startTimestamp) {
        conditions.push(`t.updated_at >= to_timestamp($/startTimestamp/)`);
      }

      if (query.endTimestamp) {
        conditions.push(`t.updated_at <= to_timestamp($/endTimestamp/)`);
      }

      if (query.tokens) {
        if (!_.isArray(query.tokens)) {
          query.tokens = [query.tokens];
        }

        for (const token of query.tokens) {
          const [contract, tokenId] = token.split(":");
          const tokensFilter = `('${_.replace(contract, "0x", "\\x")}', '${tokenId}')`;

          if (_.isUndefined((query as any).tokensFilter)) {
            (query as any).tokensFilter = [];
          }

          (query as any).tokensFilter.push(tokensFilter);
        }

        (query as any).tokensFilter = _.join((query as any).tokensFilter, ",");

        conditions.push(`(t.contract, t.token_id) IN ($/tokensFilter:raw/)`);
      }

      if (query.tokenName) {
        (query as any).tokenNameAsId = query.tokenName;
        query.tokenName = `%${query.tokenName}%`;

        if (isNaN(query.tokenName)) {
          conditions.push(`t.name ILIKE $/tokenName/`);
        } else {
          conditions.push(`
            CASE
              WHEN t.name IS NULL THEN t.token_id::text = $/tokenNameAsId/
              ELSE t.name ILIKE $/tokenName/
            END
          `);
        }
      }

      if (query.tokenSetId) {
        conditions.push(`tst.token_set_id = $/tokenSetId/`);
      }

      if (query.currencies) {
        if (!_.isArray(query.currencies)) {
          query.currencies = [query.currencies];
        }

        for (const currency of query.currencies) {
          const currencyFilter = `'${_.replace(currency, "0x", "\\x")}'`;

          if (_.isUndefined((query as any).currenciesFilter)) {
            (query as any).currenciesFilter = [];
          }

          (query as any).currenciesFilter.push(currencyFilter);
        }

        (query as any).currenciesFilter = _.join((query as any).currenciesFilter, ",");

        if (query.nativeSource || query.excludeEOA) {
          // if nativeSource is passed in, then we have two floor_sell_currency columns
          conditions.push(`s.floor_sell_currency IN ($/currenciesFilter:raw/)`);
        } else {
          conditions.push(`floor_sell_currency IN ($/currenciesFilter:raw/)`);
        }
      }

      // Determine whether we need to order by contract or not
      const contractSort = !(query.collection || (query.contract && query.contract.length == 1));

      // Continue with the next page, this depends on the sorting used
      if (query.continuation && !query.token) {
        let contArr = splitContinuation(
          query.continuation,
          /^((([0-9]+\.?[0-9]*|\.[0-9]+)|null|0x[a-fA-F0-9]+)_\d+|\d+)$/
        );
        if (contArr.length === 1 && contArr[0].includes("_")) {
          contArr = splitContinuation(contArr[0]);
        }
        if (
          query.contract ||
          query.collection ||
          query.attributes ||
          query.tokenSetId ||
          query.collectionsSetId ||
          query.tokens ||
          query.sortBy === "updatedAt"
        ) {
          switch (query.sortBy) {
            case "rarity": {
              if (contArr.length !== 3) {
                throw Boom.badRequest("Invalid continuation string used");
              }
              query.sortDirection = query.sortDirection || "asc"; // Default sorting for rarity is ASC
              const sign = query.sortDirection == "desc" ? "<" : ">";
              if (contArr[0] !== "null") {
                conditions.push(
                  `(t.rarity_rank, t.contract, t.token_id) ${sign} ($/contRarity/, $/contContract/, $/contTokenId/)
                  OR t.rarity_rank IS null`
                );
              } else {
                conditions.push(
                  `(t.rarity_rank IS null AND (t.contract, t.token_id) ${sign} ($/contContract/, $/contTokenId/))`
                );
              }
              (query as any).contRarity = contArr[0];
              (query as any).contContract = toBuffer(contArr[1]);
              (query as any).contTokenId = contArr[2];
              break;
            }

            case "tokenId": {
              if (contArr.length !== 2) {
                throw Boom.badRequest("Invalid continuation string used");
              }
              const sign = query.sortDirection == "desc" ? "<" : ">";
              conditions.push(`(t.contract, t.token_id) ${sign} ($/contContract/, $/contTokenId/)`);
              (query as any).contContract = toBuffer(contArr[0]);
              (query as any).contTokenId = contArr[1];

              break;
            }

            case "updatedAt": {
              if (contArr.length !== 3) {
                throw Boom.badRequest("Invalid continuation string used");
              }
              const sign = query.sortDirection == "desc" ? "<" : ">";
              conditions.push(
                `(t.updated_at, t.contract, t.token_id) ${sign} (to_timestamp($/contUpdatedAt/), $/contContract/, $/contTokenId/)`
              );
              (query as any).contUpdatedAt = contArr[0];
              (query as any).contContract = toBuffer(contArr[1]);
              (query as any).contTokenId = contArr[2];

              break;
            }

            case "floorAskPrice":
            default:
              {
                if (contArr.length !== 3) {
                  throw Boom.badRequest("Invalid continuation string used");
                }
                const sign = query.sortDirection == "desc" ? "<" : ">";
                const sortColumn =
                  query.nativeSource || query.excludeEOA
                    ? "s.floor_sell_value"
                    : query.normalizeRoyalties
                    ? "t.normalized_floor_sell_value"
                    : "t.floor_sell_value";

                if (contArr[0] !== "null") {
                  conditions.push(`(
                    (${sortColumn}, ${
                    contractSort
                      ? `t.contract, t.token_id) ${sign} ($/floorSellValue/, $/contContract/, $/contTokenId/)`
                      : `t.token_id) ${sign} ($/floorSellValue/, $/contTokenId/)`
                  }
                    OR (${sortColumn} IS null)
                  )`);
                  (query as any).floorSellValue = contArr[0];
                  (query as any).contContract = toBuffer(contArr[1]);
                  (query as any).contTokenId = contArr[2];
                } else {
                  conditions.push(
                    `(${sortColumn} is null AND ${
                      contractSort
                        ? `(t.contract, t.token_id) ${sign} ($/contContract/, $/contTokenId/))`
                        : `(t.token_id) ${sign} ($/contTokenId/))`
                    }`
                  );
                  (query as any).contContract = toBuffer(contArr[1]);
                  (query as any).contTokenId = contArr[2];
                }
              }
              break;
          }
        } else {
          if (contArr.length !== 2) {
            throw Boom.badRequest("Invalid continuation string used");
          }
          const sign = query.sortDirection == "desc" ? "<" : ">";
          conditions.push(`(t.contract, t.token_id) ${sign} ($/contContract/, $/contTokenId/)`);
          (query as any).contContract = toBuffer(contArr[0]);
          (query as any).contTokenId = contArr[1];
        }
      } else if (esTokens.length) {
        const sortColumn =
          query.nativeSource || query.excludeEOA
            ? "s.floor_sell_value"
            : query.normalizeRoyalties
            ? "t.normalized_floor_sell_value"
            : "t.floor_sell_value";

        conditions.push(`${sortColumn} is null`);
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting

      const getSort = function (sortBy: string, union: boolean) {
        const sortDirection = query.sortDirection || "asc";
        switch (sortBy) {
          case "rarity": {
            return ` ORDER BY ${union ? "" : "t."}rarity_rank ${sortDirection} NULLS ${
              sortDirection === "asc" ? "FIRST" : "LAST"
            }, t_contract ${sortDirection === "asc" ? "desc" : "asc"}, t_token_id ${
              sortDirection === "asc" ? "desc" : "asc"
            }`;
          }
          case "tokenId": {
            return ` ORDER BY t_contract ${sortDirection}, t_token_id ${sortDirection}`;
          }
          case "updatedAt": {
            return ` ORDER BY ${
              union ? "t_" : "t."
            }updated_at ${sortDirection}, t_contract ${sortDirection}, t_token_id ${sortDirection}`;
          }
          case "floorAskPrice":
          default: {
            const sortColumn =
              query.nativeSource || query.excludeEOA
                ? `${union ? "" : "s."}floor_sell_value`
                : query.normalizeRoyalties
                ? `${union ? "" : "t."}normalized_floor_sell_value`
                : `${union ? "" : "t."}floor_sell_value`;

            return ` ORDER BY ${sortColumn} ${sortDirection} NULLS ${
              sortDirection === "asc" ? "LAST" : "FIRST"
            }, ${contractSort ? `t_contract ${sortDirection}, ` : ""}t_token_id ${sortDirection}`;
          }
        }
      };

      // Only allow sorting on floorSell when we filter by collection / attributes / tokenSetId / rarity
      if (
        query.collection ||
        query.attributes ||
        query.tokenSetId ||
        query.rarity ||
        query.tokens ||
        (query.sortBy === "updatedAt" &&
          !(query.collectionsSetId || query.community || query.contract))
      ) {
        baseQuery += getSort(query.sortBy, false);
      }

      // Break query into UNION of results for each collectionId or contract
      if (query.collectionsSetId || query.community || (query.contract && !query.collection)) {
        const unionQueries = [];
        const unionValues = query.contract ? query.contract : collections;

        for (const i in unionValues) {
          const sharedContract = !query.contract && unionValues[i].includes(":");
          const unionType = query.contract || !sharedContract ? "contract" : "collection_id";
          const unionFilter = `${unionType}${i}`;
          (query as any)[unionFilter] =
            !query.contract && !sharedContract ? toBuffer(unionValues[i]) : unionValues[i];

          // For shared contracts, filter by both contract and collection
          if (sharedContract) {
            (query as any)[`collectionContract${i}`] = unionValues[i].split(":")[0];
          }

          unionQueries.push(
            `(
              ${baseQuery}
              ${conditions.length ? `AND ` : `WHERE `} t.${unionType} = $/${unionFilter}/
              ${sharedContract ? `AND t.contract = $/collectionContract${i}/` : ""}
              ${unionValues.length > 1 ? `${getSort(query.sortBy, false)} LIMIT $/limit/` : ""}
            )`
          );
        }

        baseQuery = `
          ${unionQueries.join(` UNION ALL `)}
          ${getSort(query.sortBy, unionValues.length > 1)}
        `;
      }

      baseQuery += ` LIMIT $/limit/`;

      // Include top bid
      if (query.includeTopBid) {
        baseQuery = `
          WITH x AS (
            ${baseQuery}
          )
          SELECT 
            x.*, 
            y.*
          FROM x
          LEFT JOIN LATERAL (
            SELECT
              o.id AS top_buy_id,
              o.normalized_value AS top_buy_normalized_value,
              o.currency_normalized_value AS top_buy_currency_normalized_value,
              o.maker AS top_buy_maker,
              o.currency AS top_buy_currency,
              o.fee_breakdown AS top_buy_fee_breakdown,
              o.currency_price AS top_buy_currency_price,
              o.currency_value AS top_buy_currency_value,
              o.price AS top_buy_price,
              o.value AS top_buy_value,
              o.source_id_int AS top_buy_source_id_int,
              o.missing_royalties AS top_buy_missing_royalties,
              DATE_PART('epoch', LOWER(o.valid_between)) AS top_buy_valid_from,
              COALESCE(
                NULLIF(DATE_PART('epoch', UPPER(o.valid_between)), 'Infinity'),
                0
              ) AS top_buy_valid_until
            FROM orders o
            JOIN token_sets_tokens tst
              ON o.token_set_id = tst.token_set_id
            WHERE tst.contract = x.t_contract
              AND tst.token_id = x.t_token_id
              AND o.side = 'buy'
              AND o.fillability_status = 'fillable'
              AND o.approval_status = 'approved'
              ${query.excludeEOA ? `AND o.kind NOT IN ('blur')` : ""}
              AND EXISTS(
                SELECT FROM nft_balances nb
                  WHERE nb.contract = x.t_contract
                  AND nb.token_id = x.t_token_id
                  AND nb.amount > 0
                  AND nb.owner != o.maker
                  AND (
                    o.taker IS NULL
                    OR o.taker = '\\x0000000000000000000000000000000000000000'
                    OR o.taker = nb.owner
                  )
              )
              ${query.normalizeRoyalties ? " AND o.normalized_value IS NOT NULL" : ""}
            ORDER BY o.value DESC
            LIMIT 1
          ) y ON TRUE
        `;
      }

      const rawResult = await redb.manyOrNone(baseQuery, query);

      /** Depending on how we sorted, we use that sorting key to determine the next page of results
          Possible formats:
            rarity_tokenid
            floorAskPrice_tokenid
            contract_tokenid
            tokenid
       **/
      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation = "";

        // Only build a "value_tokenid" continuation string when we filter on collection or attributes
        // Otherwise continuation string will just be based on the last tokenId. This is because only use sorting
        // when we have collection/attributes
        if (
          query.contract ||
          query.collection ||
          query.attributes ||
          query.tokenSetId ||
          query.collectionsSetId ||
          query.tokens ||
          query.sortBy === "updatedAt"
        ) {
          switch (query.sortBy) {
            case "rarity":
              continuation = rawResult[rawResult.length - 1].rarity_rank || "null";
              break;

            case "updatedAt":
              continuation = rawResult[rawResult.length - 1].t_updated_at;
              break;

            case "floorAskPrice":
              continuation = rawResult[rawResult.length - 1].floor_sell_value || "null";
              break;
            default:
              break;
          }
        }

        continuation +=
          (continuation ? "_" : "") + fromBuffer(rawResult[rawResult.length - 1].t_contract);
        continuation += "_" + rawResult[rawResult.length - 1].t_token_id;

        continuation = buildContinuation(continuation);
      }

      const sources = await Sources.getInstance();
      const result = rawResult.map(async (r) => {
        const feeBreakdown = r.top_buy_fee_breakdown;

        if (query.normalizeRoyalties && r.top_buy_missing_royalties) {
          for (let i = 0; i < r.top_buy_missing_royalties.length; i++) {
            const index: number = r.top_buy_fee_breakdown.findIndex(
              (fee: { recipient: string }) =>
                fee.recipient === r.top_buy_missing_royalties[i].recipient
            );

            const missingFeeBps = Number(r.top_buy_missing_royalties[i].bps);

            if (index !== -1) {
              feeBreakdown[index].bps += missingFeeBps;
            } else {
              feeBreakdown.push({
                bps: missingFeeBps,
                kind: "royalty",
                recipient: r.top_buy_missing_royalties[i].recipient,
              });
            }
          }
        }

        const contract = fromBuffer(r.t_contract);
        const tokenId = r.t_token_id;

        const floorSellSource = r.floor_sell_value
          ? sources.get(Number(r.floor_sell_source_id_int), contract, tokenId)
          : undefined;

        const topBuySource = r.top_buy_id
          ? sources.get(Number(r.top_buy_source_id_int), contract, tokenId)
          : undefined;

        // Use default currencies for backwards compatibility with entries
        // that don't have the currencies cached in the tokens table
        const floorAskCurrency = r.floor_sell_currency
          ? fromBuffer(r.floor_sell_currency)
          : Sdk.Common.Addresses.Native[config.chainId];
        const topBidCurrency = r.top_buy_currency
          ? fromBuffer(r.top_buy_currency)
          : Sdk.Common.Addresses.WNative[config.chainId];

        const collectionFloorAskCurrency = r.c_floor_sell_currency
          ? fromBuffer(r.c_floor_sell_currency)
          : Sdk.Common.Addresses.Native[config.chainId];

        let dynamicPricing = undefined;
        if (query.includeDynamicPricing) {
          // Add missing royalties on top of the raw prices
          const missingRoyalties = query.normalizeRoyalties
            ? ((r.floor_sell_missing_royalties ?? []) as any[])
                .map((mr: any) => bn(mr.amount))
                .reduce((a, b) => a.add(b), bn(0))
            : bn(0);

          if (r.floor_sell_raw_data) {
            if (r.floor_sell_dynamic && r.floor_sell_order_kind === "seaport") {
              const order = new Sdk.SeaportV11.Order(config.chainId, r.floor_sell_raw_data);

              // Dutch auction
              dynamicPricing = {
                kind: "dutch",
                data: {
                  price: {
                    start: await getJoiPriceObject(
                      {
                        gross: {
                          amount: bn(order.getMatchingPrice(order.params.startTime))
                            .add(missingRoyalties)
                            .toString(),
                        },
                      },
                      floorAskCurrency,
                      query.displayCurrency
                    ),
                    end: await getJoiPriceObject(
                      {
                        gross: {
                          amount: bn(order.getMatchingPrice(order.params.endTime))
                            .add(missingRoyalties)
                            .toString(),
                        },
                      },
                      floorAskCurrency,
                      query.displayCurrency
                    ),
                  },
                  time: {
                    start: order.params.startTime,
                    end: order.params.endTime,
                  },
                },
              };
            } else if (
              [
                "sudoswap",
                "sudoswap-v2",
                "nftx",
                "collectionxyz",
                "caviar-v1",
                "midaswap",
              ].includes(r.floor_sell_order_kind)
            ) {
              // Pool orders
              dynamicPricing = {
                kind: "pool",
                data: {
                  pool: r.floor_sell_raw_data.pair ?? r.floor_sell_raw_data.pool,
                  prices: await Promise.all(
                    (r.floor_sell_raw_data.extra.prices as string[])
                      .filter((price) =>
                        bn(price).lte(bn(r.floor_sell_raw_data.extra.floorPrice || MaxUint256))
                      )
                      .map((price) =>
                        getJoiPriceObject(
                          {
                            gross: {
                              amount: bn(price).add(missingRoyalties).toString(),
                            },
                          },
                          floorAskCurrency,
                          query.displayCurrency
                        )
                      )
                  ),
                },
              };
            }
          }
        }

        const metadata = {
          imageOriginal: undefined,
          mediaOriginal: undefined,
        };

        if (r.metadata?.image_original_url) {
          metadata.imageOriginal = r.metadata.image_original_url;
        }

        if (r.metadata?.animation_original_url) {
          metadata.mediaOriginal = r.metadata.animation_original_url;
        }

        return {
          token: getJoiTokenObject(
            {
              chainId: config.chainId,
              contract,
              tokenId,
              name: r.name,
              description: r.description,
              image: Assets.getResizedImageUrl(r.image, ImageSize.medium, r.image_version),
              imageSmall: Assets.getResizedImageUrl(r.image, ImageSize.small, r.image_version),
              imageLarge: Assets.getResizedImageUrl(r.image, ImageSize.large, r.image_version),
              metadata: Object.values(metadata).every((el) => el === undefined)
                ? undefined
                : metadata,
              media: r.media,
              kind: r.kind,
              isFlagged: Boolean(Number(r.is_flagged)),
              isSpam: Number(r.t_is_spam) > 0 || Number(r.c_is_spam) > 0,
              metadataDisabled:
                Boolean(Number(r.t_metadata_disabled)) || Boolean(Number(r.c_metadata_disabled)),
              lastFlagUpdate: r.last_flag_update
                ? new Date(r.last_flag_update).toISOString()
                : null,
              lastFlagChange: r.last_flag_change
                ? new Date(r.last_flag_change).toISOString()
                : null,
              supply: !_.isNull(r.supply) ? r.supply : null,
              remainingSupply: !_.isNull(r.remaining_supply) ? r.remaining_supply : null,
              rarity: r.rarity_score,
              rarityRank: r.rarity_rank,
              collection: {
                id: r.collection_id,
                name: r.collection_name,
                image: Assets.getLocalAssetsLink(r.collection_image),
                slug: r.slug,
                symbol: r.symbol,
                creator: r.creator ? fromBuffer(r.creator) : null,
                tokenCount: r.token_count,
                metadataDisabled: Boolean(Number(r.c_metadata_disabled)),
                floorAskPrice: r.c_floor_sell_value
                  ? await getJoiPriceObject(
                      {
                        gross: {
                          amount: String(r.c_floor_sell_currency_value ?? r.c_floor_sell_value),
                          nativeAmount: String(r.c_floor_sell_value),
                        },
                      },
                      collectionFloorAskCurrency,
                      query.displayCurrency
                    )
                  : null,
              },
              lastSale:
                query.includeLastSale && r.last_sale_currency
                  ? await getJoiSaleObject({
                      prices: {
                        gross: {
                          amount: r.last_sale_currency_price ?? r.last_sale_price,
                          nativeAmount: r.last_sale_price,
                          usdAmount: r.last_sale_usd_price,
                        },
                      },
                      fees: {
                        royaltyFeeBps: r.last_sale_royalty_fee_bps,
                        marketplaceFeeBps: r.last_sale_marketplace_fee_bps,
                        paidFullRoyalty: r.last_sale_paid_full_royalty,
                        royaltyFeeBreakdown: r.last_sale_royalty_fee_breakdown,
                        marketplaceFeeBreakdown: r.last_sale_marketplace_fee_breakdown,
                      },
                      currencyAddress: r.last_sale_currency,
                      timestamp: r.last_sale_timestamp,
                      orderSourceId: r.last_sale_order_source_id_int,
                      fillSourceId: r.last_sale_fill_source_id,
                    })
                  : undefined,
              owner: r.owner ? fromBuffer(r.owner) : null,
              attributes: query.includeAttributes
                ? r.attributes
                  ? _.map(r.attributes, (attribute) => ({
                      key: attribute.key,
                      kind: attribute.kind,
                      value: attribute.value,
                      tokenCount: attribute.tokenCount,
                      onSaleCount: attribute.onSaleCount,
                      floorAskPrice: attribute.floorAskPrice
                        ? formatEth(attribute.floorAskPrice)
                        : attribute.floorAskPrice,
                      topBidValue: attribute.topBidValue
                        ? formatEth(attribute.topBidValue)
                        : attribute.topBidValue,
                      createdAt: new Date(attribute.createdAt).toISOString(),
                    }))
                  : []
                : undefined,
              mintStages: r.mint_stages
                ? await Promise.all(
                    r.mint_stages.map(async (m: any) => ({
                      stage: m.stage,
                      kind: m.kind,
                      tokenId: m.tokenId,
                      price: m.price
                        ? await getJoiPriceObject({ gross: { amount: m.price } }, m.currency)
                        : m.price,
                      startTime: m.startTime,
                      endTime: m.endTime,
                      maxMintsPerWallet: m.maxMintsPerWallet,
                    }))
                  )
                : [],
            },
            r.t_metadata_disabled,
            r.c_metadata_disabled
          ),
          market: {
            floorAsk: {
              id: r.floor_sell_id,
              price: r.floor_sell_id
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount: r.floor_sell_currency_value ?? r.floor_sell_value,
                        nativeAmount: r.floor_sell_value,
                      },
                    },
                    floorAskCurrency,
                    query.displayCurrency
                  )
                : null,
              maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
              validFrom: r.floor_sell_value ? r.floor_sell_valid_from : null,
              validUntil: r.floor_sell_value ? r.floor_sell_valid_to : null,
              quantityFilled:
                query.includeQuantity && r.floor_sell_value
                  ? r.floor_sell_quantity_filled
                  : undefined,
              quantityRemaining:
                query.includeQuantity && r.floor_sell_value
                  ? r.floor_sell_quantity_remaining
                  : undefined,
              dynamicPricing,
              source: getJoiSourceObject(floorSellSource),
            },
            topBid: query.includeTopBid
              ? {
                  id: r.top_buy_id,
                  price: r.top_buy_value
                    ? await getJoiPriceObject(
                        {
                          net: {
                            amount: query.normalizeRoyalties
                              ? r.top_buy_currency_normalized_value ?? r.top_buy_value
                              : r.top_buy_currency_value ?? r.top_buy_value,
                            nativeAmount: query.normalizeRoyalties
                              ? r.top_buy_normalized_value ?? r.top_buy_value
                              : r.top_buy_value,
                          },
                          gross: {
                            amount: r.top_buy_currency_price ?? r.top_buy_price,
                            nativeAmount: r.top_buy_price,
                          },
                        },
                        topBidCurrency,
                        query.displayCurrency
                      )
                    : null,
                  maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
                  validFrom: r.top_buy_valid_from,
                  validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
                  source: getJoiSourceObject(topBuySource),
                  feeBreakdown: feeBreakdown,
                }
              : undefined,
          },
          updatedAt: new Date(r.t_updated_at * 1000).toISOString(),
        };

        return {
          token: {
            chainId: config.chainId,
            contract,
            tokenId,
            name: r.name,
            description: r.description,
            image: Assets.getResizedImageUrl(r.image),
            imageSmall: Assets.getResizedImageUrl(r.image, ImageSize.small),
            imageLarge: Assets.getResizedImageUrl(r.image, ImageSize.large),
            metadata: Object.values(metadata).every((el) => el === undefined)
              ? undefined
              : metadata,
            media: r.media,
            kind: r.kind,
            isFlagged: Boolean(Number(r.is_flagged)),
            isSpam: Number(r.t_is_spam) > 0 || Number(r.c_is_spam) > 0,
            metadataDisabled:
              Boolean(Number(r.t_metadata_disabled)) || Boolean(Number(r.c_metadata_disabled)),
            lastFlagUpdate: r.last_flag_update ? new Date(r.last_flag_update).toISOString() : null,
            lastFlagChange: r.last_flag_change ? new Date(r.last_flag_change).toISOString() : null,
            supply: !_.isNull(r.supply) ? r.supply : null,
            remainingSupply: !_.isNull(r.remaining_supply) ? r.remaining_supply : null,
            rarity: r.rarity_score,
            rarityRank: r.rarity_rank,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
              image: Assets.getLocalAssetsLink(r.collection_image),
              slug: r.slug,
              symbol: r.symbol,
              creator: r.creator ? fromBuffer(r.creator) : null,
              tokenCount: r.token_count,
              metadataDisabled: Boolean(Number(r.c_metadata_disabled)),
            },
            lastSale:
              query.includeLastSale && r.last_sale_currency
                ? await getJoiSaleObject({
                    prices: {
                      gross: {
                        amount: r.last_sale_currency_price ?? r.last_sale_price,
                        nativeAmount: r.last_sale_price,
                        usdAmount: r.last_sale_usd_price,
                      },
                    },
                    fees: {
                      royaltyFeeBps: r.last_sale_royalty_fee_bps,
                      marketplaceFeeBps: r.last_sale_marketplace_fee_bps,
                      paidFullRoyalty: r.last_sale_paid_full_royalty,
                      royaltyFeeBreakdown: r.last_sale_royalty_fee_breakdown,
                      marketplaceFeeBreakdown: r.last_sale_marketplace_fee_breakdown,
                    },
                    currencyAddress: r.last_sale_currency,
                    timestamp: r.last_sale_timestamp,
                    orderSourceId: r.last_sale_order_source_id_int,
                    fillSourceId: r.last_sale_fill_source_id,
                  })
                : undefined,
            owner: r.owner ? fromBuffer(r.owner) : null,
            attributes: query.includeAttributes
              ? r.attributes
                ? _.map(r.attributes, (attribute) => ({
                    key: attribute.key,
                    kind: attribute.kind,
                    value: attribute.value,
                    tokenCount: attribute.tokenCount,
                    onSaleCount: attribute.onSaleCount,
                    floorAskPrice: attribute.floorAskPrice
                      ? formatEth(attribute.floorAskPrice)
                      : attribute.floorAskPrice,
                    topBidValue: attribute.topBidValue
                      ? formatEth(attribute.topBidValue)
                      : attribute.topBidValue,
                    createdAt: new Date(attribute.createdAt).toISOString(),
                  }))
                : []
              : undefined,
          },
          market: {
            floorAsk: {
              id: r.floor_sell_id,
              price: r.floor_sell_id
                ? await getJoiPriceObject(
                    {
                      gross: {
                        amount: r.floor_sell_currency_value ?? r.floor_sell_value,
                        nativeAmount: r.floor_sell_value,
                      },
                    },
                    floorAskCurrency,
                    query.displayCurrency
                  )
                : null,
              maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
              validFrom: r.floor_sell_value ? r.floor_sell_valid_from : null,
              validUntil: r.floor_sell_value ? r.floor_sell_valid_to : null,
              quantityFilled:
                query.includeQuantity && r.floor_sell_value
                  ? r.floor_sell_quantity_filled
                  : undefined,
              quantityRemaining:
                query.includeQuantity && r.floor_sell_value
                  ? r.floor_sell_quantity_remaining
                  : undefined,
              dynamicPricing,
              source: getJoiSourceObject(floorSellSource),
            },
            topBid: query.includeTopBid
              ? {
                  id: r.top_buy_id,
                  price: r.top_buy_value
                    ? await getJoiPriceObject(
                        {
                          net: {
                            amount: query.normalizeRoyalties
                              ? r.top_buy_currency_normalized_value ?? r.top_buy_value
                              : r.top_buy_currency_value ?? r.top_buy_value,
                            nativeAmount: query.normalizeRoyalties
                              ? r.top_buy_normalized_value ?? r.top_buy_value
                              : r.top_buy_value,
                          },
                          gross: {
                            amount: r.top_buy_currency_price ?? r.top_buy_price,
                            nativeAmount: r.top_buy_price,
                          },
                        },
                        topBidCurrency,
                        query.displayCurrency
                      )
                    : null,
                  maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
                  validFrom: r.top_buy_valid_from,
                  validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
                  source: getJoiSourceObject(topBuySource),
                  feeBreakdown: feeBreakdown,
                }
              : undefined,
          },
          updatedAt: new Date(r.t_updated_at * 1000).toISOString(),
        };
      });

      const dbTokens = await Promise.all(result);

      return {
        tokens: esTokens.concat(dbTokens),
        continuation,
      };
    } catch (error) {
      logger.error(`get-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
