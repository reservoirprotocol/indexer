/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";
import _ from "lodash";
import * as Boom from "@hapi/boom";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  getJoiPriceObject,
  getJoiSourceObject,
  getJoiTokenObject,
  JoiAttributeValue,
  JoiPrice,
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

const version = "v5";

export const getTokensV5Options: RouteOptions = {
  description: "Tokens",
  notes:
    "Get a list of tokens with full metadata. This is useful for showing a single token page, or scenarios that require more metadata.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 9,
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
        .description("Filter to a particular collection set.")
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
      contract: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        )
        .when("flagStatus", {
          is: Joi.exist(),
          then: Joi.forbidden(),
          otherwise: Joi.allow(),
        }),
      tokenName: Joi.string().description(
        "Filter to a particular token by name. Example: `token #1`"
      ),
      tokens: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(Joi.string().lowercase().pattern(regex.token))
          .description(
            "Array of tokens. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          ),
        Joi.string()
          .lowercase()
          .pattern(regex.token)
          .description(
            "Array of tokens. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          )
      ),
      tokenSetId: Joi.string()
        .description(
          "Filter to a particular token set. Example: `token:CONTRACT:TOKEN_ID` representing a single token within contract, `contract:CONTRACT` representing a whole contract, `range:CONTRACT:START_TOKEN_ID:END_TOKEN_ID` representing a continuous token id range within a contract and `list:CONTRACT:TOKEN_IDS_HASH` representing a list of token ids within a contract."
        )
        .when("flagStatus", {
          is: Joi.exist(),
          then: Joi.forbidden(),
          otherwise: Joi.allow(),
        }),
      attributes: Joi.object()
        .unknown()
        .description(
          "Filter to a particular attribute. Note: Our docs do not support this parameter correctly. To test, you can use the following URL in your browser. Example: `https://api.reservoir.tools/tokens/v5?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attributes[Type]=Original` or `https://api.reservoir.tools/tokens/v5?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attributes[Type]=Original&attributes[Type]=Sibling`"
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
        .description("Get tokens with a min rarity rank (inclusive)"),
      maxRarityRank: Joi.number()
        .integer()
        .min(1)
        .description("Get tokens with a max rarity rank (inclusive)"),
      minFloorAskPrice: Joi.number().description(
        "Get tokens with a min floor ask price (inclusive)"
      ),
      maxFloorAskPrice: Joi.number().description(
        "Get tokens with a max floor ask price (inclusive)"
      ),
      flagStatus: Joi.number()
        .allow(-1, 0, 1)
        .description(
          "Allowed only with collection and tokens filtering!\n-1 = All tokens (default)\n0 = Non flagged tokens\n1 = Flagged tokens"
        ),
      sortBy: Joi.string()
        .valid("floorAskPrice", "tokenId", "rarity")
        .default("floorAskPrice")
        .description("Order the items are returned in the response."),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      currencies: Joi.alternatives().try(
        Joi.array()
          .max(50)
          .items(Joi.string().lowercase().pattern(regex.address))
          .description(
            "Filter to tokens with a listing in a particular currency. `Example: currencies[0]: 0x0000000000000000000000000000000000000000`"
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
        .max(100)
        .default(20)
        .description("Amount of items returned in response."),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
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
      includeRoyaltiesPaid: Joi.boolean()
        .default(false)
        .description(
          "If true, a boolean indicating whether royalties were paid on a token's last sale will be returned in the response."
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
        .description("Return result in given currency"),
    })
      .or("collection", "contract", "tokens", "tokenSetId", "community", "collectionsSetId")
      .oxor("collection", "contract", "tokens", "tokenSetId", "community", "collectionsSetId")
      .oxor("source", "nativeSource")
      .with("attributes", "collection")
      .with("tokenName", "collection"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string().lowercase().pattern(regex.address).required(),
            tokenId: Joi.string().pattern(regex.number).required(),
            name: Joi.string().allow("", null),
            description: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            media: Joi.string().allow("", null),
            kind: Joi.string().allow("", null),
            isFlagged: Joi.boolean().default(false),
            lastFlagUpdate: Joi.string().allow("", null),
            lastFlagChange: Joi.string().allow("", null),
            rarity: Joi.number().unsafe().allow(null),
            rarityRank: Joi.number().unsafe().allow(null),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow("", null),
              image: Joi.string().allow("", null),
              slug: Joi.string().allow("", null),
            }),
            lastBuy: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            lastSell: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            owner: Joi.string().allow(null),
            attributes: Joi.array()
              .items(
                Joi.object({
                  key: Joi.string(),
                  kind: Joi.string(),
                  value: JoiAttributeValue,
                  tokenCount: Joi.number(),
                  onSaleCount: Joi.number(),
                  floorAskPrice: Joi.number().unsafe().allow(null),
                  topBidValue: Joi.number().unsafe().allow(null),
                  createdAt: Joi.string(),
                })
              )
              .optional(),
          }),
          market: Joi.object({
            floorAsk: {
              id: Joi.string().allow(null),
              price: JoiPrice.allow(null),
              maker: Joi.string().lowercase().pattern(regex.address).allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
              quantityFilled: Joi.number().unsafe().allow(null),
              quantityRemaining: Joi.number().unsafe().allow(null),
              dynamicPricing: Joi.object({
                kind: Joi.string().valid("dutch", "pool"),
                data: Joi.object(),
              }),
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
                    kind: Joi.string(),
                    recipient: Joi.string().lowercase().pattern(regex.address).allow(null),
                    bps: Joi.number(),
                  })
                )
                .allow(null),
            }).optional(),
            royaltiesPaid: Joi.boolean().default(false).optional(),
          }),
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

    // Include top bid
    let selectTopBid = "";
    let topBidQuery = "";
    let nullsPosition = "LAST";

    if (query.includeTopBid) {
      selectTopBid = `, y.*`;
      topBidQuery = `
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
          WHERE tst.contract = t.contract
            AND tst.token_id = t.token_id
            AND o.side = 'buy'
            AND o.fillability_status = 'fillable'
            AND o.approval_status = 'approved'
            AND EXISTS(
              SELECT FROM nft_balances nb
                WHERE nb.contract = t.contract
                AND nb.token_id = t.token_id
                AND nb.amount > 0
                AND nb.owner != o.maker
            )
            ${query.normalizeRoyalties ? " AND o.normalized_value IS NOT NULL" : ""}
          ORDER BY o.value DESC
          LIMIT 1
        ) y ON TRUE
      `;
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

    let includeRoyaltiesPaidQuery = "";
    let selectIncludeRoyaltiesPaid = "";
    if (query.includeRoyaltiesPaid) {
      selectIncludeRoyaltiesPaid = ", r.*";
      includeRoyaltiesPaidQuery = `
      LEFT JOIN LATERAL (
        SELECT
          CASE WHEN f.royalty_fee_breakdown IS NOT NULL THEN true
          WHEN o.fee_breakdown IS NULL THEN false
          WHEN 'royalty' IN (SELECT jsonb_array_elements(o.fee_breakdown)->>'kind') THEN true
          ELSE false END AS royalties_paid
        FROM fill_events_2 f
        LEFT JOIN orders o ON f.order_id = o.id
        WHERE f.contract = t.contract AND f.token_id = t.token_id AND f.is_deleted = 0
        ORDER BY timestamp DESC LIMIT 1
      ) r ON TRUE
      `;
    }

    let sourceCte = "";
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
      selectFloorData = "s.*";

      const sourceConditions: string[] = [];
      sourceConditions.push(`side = 'sell'`);
      sourceConditions.push(`fillability_status = 'fillable'`);
      sourceConditions.push(`approval_status = 'approved'`);
      sourceConditions.push(`source_id_int = $/nativeSource/`);
      sourceConditions.push(
        `taker = '\\x0000000000000000000000000000000000000000' OR taker IS NULL`
      );
      if (query.currencies) {
        sourceConditions.push(`currency IN ($/currenciesFilter:raw/)`);
      }

      if (query.contract) {
        sourceConditions.push(`contract = $/contract/`);
      } else if (query.collection) {
        let contractString = query.collection;
        if (query.collection.includes(":")) {
          const [contract, ,] = query.collection.split(":");
          contractString = contract;
        }

        (query as any).contract = contractString;
        sourceConditions.push(`contract = $/contract/`);
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

    try {
      let baseQuery = `
        ${sourceCte}
        SELECT
          t.contract,
          t.token_id,
          t.name,
          t.description,
          t.image,
          t.media,
          t.collection_id,
          c.name AS collection_name,
          con.kind,
          ${selectFloorData},
          t.rarity_score,
          t.rarity_rank,
          t.is_flagged,
          t.last_flag_update,
          t.last_flag_change,
          t.metadata_disabled AS t_metadata_disabled,
          c.metadata_disabled AS c_metadata_disabled,
          c.image_version as collection_image_version,
          c.slug,
          t.last_buy_value,
          t.last_buy_timestamp,
          t.last_sell_value,
          t.last_sell_timestamp,
          t.image_version,
          (t.metadata ->> 'image_mime_type')::TEXT AS image_mime_type,
          (t.metadata ->> 'media_mime_type')::TEXT AS media_mime_type,
          (c.metadata ->> 'imageUrl')::TEXT AS collection_image,
          (
            SELECT
              nb.owner
            FROM nft_balances nb
            WHERE nb.contract = t.contract
              AND nb.token_id = t.token_id
              AND nb.amount > 0
            LIMIT 1
          ) AS owner
          ${selectAttributes}
          ${selectTopBid}
          ${selectIncludeQuantity}
          ${selectIncludeDynamicPricing}
          ${selectIncludeRoyaltiesPaid}
        FROM tokens t
        ${topBidQuery}
        ${
          sourceCte !== ""
            ? "JOIN filtered_orders s ON s.contract = t.contract AND s.token_id = t.token_id"
            : ""
        }
        ${includeQuantityQuery}
        ${includeDynamicPricingQuery}
        ${includeRoyaltiesPaidQuery}
        JOIN collections c ON t.collection_id = c.id
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
        conditions.push(`t.collection_id = $/collection/`);
      }

      if (_.indexOf([0, 1], query.flagStatus) !== -1) {
        conditions.push(`t.is_flagged = $/flagStatus/`);
      }

      if (query.community) {
        conditions.push("c.community = $/community/");
      }

      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`t.contract = $/contract/`);
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
          `${query.nativeSource ? "s." : "t."}${
            query.normalizeRoyalties ? "normalized_" : ""
          }floor_sell_value >= $/minFloorSellValue/`
        );
      }

      if (query.maxFloorAskPrice !== undefined) {
        (query as any).maxFloorSellValue = query.maxFloorAskPrice * 10 ** 18;
        conditions.push(
          `${query.nativeSource ? "s." : "t."}${
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
        query.tokenName = "%" + query.tokenName + "%";
        conditions.push(`t.name ILIKE $/tokenName/`);
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

        if (query.nativeSource) {
          // if nativeSource is passed in, then we have two floor_sell_currency columns
          conditions.push(`s.floor_sell_currency IN ($/currenciesFilter:raw/)`);
        } else {
          conditions.push(`floor_sell_currency IN ($/currenciesFilter:raw/)`);
        }
      }

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
          query.collection ||
          query.attributes ||
          query.tokenSetId ||
          query.collectionsSetId ||
          query.tokens
        ) {
          switch (query.sortBy) {
            case "rarity": {
              if (contArr.length !== 3) {
                throw Boom.badRequest("Invalid continuation string used");
              }
              query.sortDirection = query.sortDirection || "asc"; // Default sorting for rarity is ASC
              const sign = query.sortDirection == "desc" ? "<" : ">";
              conditions.push(
                `(t.rarity_rank, t.contract, t.token_id) ${sign} ($/contRarity/, $/contContract/, $/contTokenId/)`
              );
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

            case "floorAskPrice":
            default:
              {
                if (contArr.length !== 3) {
                  throw Boom.badRequest("Invalid continuation string used");
                }
                const sign = query.sortDirection == "desc" ? "<" : ">";
                const sortColumn = query.nativeSource
                  ? "s.floor_sell_value"
                  : query.normalizeRoyalties
                  ? "t.normalized_floor_sell_value"
                  : "t.floor_sell_value";

                if (contArr[0] !== "null") {
                  conditions.push(`(
                    (${sortColumn}, t.contract, t.token_id) ${sign} ($/floorSellValue/, $/contContract/, $/contTokenId/)
                    OR (${sortColumn} IS null)
                  )`);
                  (query as any).floorSellValue = contArr[0];
                  (query as any).contContract = toBuffer(contArr[1]);
                  (query as any).contTokenId = contArr[2];
                } else {
                  conditions.push(
                    `(${sortColumn} is null AND (t.contract, t.token_id) ${sign} ($/contContract/, $/contTokenId/))`
                  );
                  nullsPosition = "FIRST";
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
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting

      const getSort = function (sortBy: string, union: boolean) {
        switch (sortBy) {
          case "rarity": {
            return ` ORDER BY ${union ? "" : "t."}rarity_rank ${
              query.sortDirection || "ASC"
            } NULLS ${nullsPosition}, ${union ? "" : "t."}contract ${
              query.sortDirection || "ASC"
            }, ${union ? "" : "t."}token_id ${query.sortDirection || "ASC"}`;
          }
          case "tokenId": {
            return ` ORDER BY ${union ? "" : "t."}contract ${query.sortDirection || "ASC"}, ${
              union ? "" : "t."
            }token_id ${query.sortDirection || "ASC"}`;
          }
          case "floorAskPrice":
          default: {
            const sortColumn = query.nativeSource
              ? `${union ? "" : "s."}floor_sell_value`
              : query.normalizeRoyalties
              ? `${union ? "" : "t."}normalized_floor_sell_value`
              : `${union ? "" : "t."}floor_sell_value`;

            return ` ORDER BY ${sortColumn} ${
              query.sortDirection || "ASC"
            } NULLS ${nullsPosition}, ${union ? "" : "t."}contract ${
              query.sortDirection || "ASC"
            }, ${union ? "" : "t."}token_id ${query.sortDirection || "ASC"}`;
          }
        }
      };

      // Only allow sorting on floorSell when we filter by collection / attributes / tokenSetId / rarity
      if (
        query.collection ||
        query.attributes ||
        query.tokenSetId ||
        query.rarity ||
        query.tokens
      ) {
        baseQuery += getSort(query.sortBy, false);
      } else if (query.contract) {
        baseQuery += ` ORDER BY t.contract ${query.sortDirection || "ASC"}, t.token_id ${
          query.sortDirection || "ASC"
        }`;
      }

      // Break query into UNION of results for each collectionId when filtering on collectionsSetId
      if (query.collectionsSetId) {
        const collectionsSetQueries = [];
        const collections = await CollectionSets.getCollectionsIds(query.collectionsSetId);

        if (_.isEmpty(collections)) {
          throw Boom.badRequest(`No collections for collection set ${query.collectionsSetId}`);
        }

        const collectionsSetSort = getSort(query.sortBy, true);

        for (const i in collections) {
          (query as any)[`collection${i}`] = collections[i];
          collectionsSetQueries.push(
            `(
              ${baseQuery}
              ${conditions.length ? `AND ` : `WHERE `} t.collection_id = $/collection${i}/
              ${collectionsSetSort}
              LIMIT $/limit/
            )`
          );
        }

        baseQuery = `
          ${collectionsSetQueries.join(` UNION ALL `)}
          ${collectionsSetSort}
        `;
      }

      baseQuery += ` LIMIT $/limit/`;

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
          query.collection ||
          query.attributes ||
          query.tokenSetId ||
          query.collectionsSetId ||
          query.tokens
        ) {
          switch (query.sortBy) {
            case "rarity":
              continuation = rawResult[rawResult.length - 1].rarity_rank || "null";
              break;

            case "floorAskPrice":
              continuation = rawResult[rawResult.length - 1].floor_sell_value || "null";
              break;
            default:
              break;
          }
        }

        continuation +=
          (continuation ? "_" : "") + fromBuffer(rawResult[rawResult.length - 1].contract);
        continuation += "_" + rawResult[rawResult.length - 1].token_id;

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

        const contract = fromBuffer(r.contract);
        const tokenId = r.token_id;

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
              ["sudoswap", "sudoswap-v2", "nftx", "caviar-v1"].includes(r.floor_sell_order_kind)
            ) {
              // Pool orders
              dynamicPricing = {
                kind: "pool",
                data: {
                  pool: r.floor_sell_raw_data.pair ?? r.floor_sell_raw_data.pool,
                  prices: await Promise.all(
                    (r.floor_sell_raw_data.extra.prices as string[]).map((price) =>
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

        return {
          token: getJoiTokenObject(
            {
              contract,
              tokenId,
              name: r.name,
              description: r.description,
              image: Assets.getResizedImageUrl(r.image, undefined, r.image_version),
              media: r.media,
              kind: r.kind,
              isFlagged: Boolean(Number(r.is_flagged)),
              lastFlagUpdate: r.last_flag_update
                ? new Date(r.last_flag_update).toISOString()
                : null,
              lastFlagChange: r.last_flag_change
                ? new Date(r.last_flag_change).toISOString()
                : null,
              rarity: r.rarity_score,
              rarityRank: r.rarity_rank,
              collection: {
                id: r.collection_id,
                name: r.collection_name,
                image: Assets.getResizedImageUrl(
                  r.collection_image,
                  ImageSize.small,
                  r.collection_image_version
                ),
                slug: r.slug,
              },
              lastBuy: {
                value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
                timestamp: r.last_buy_timestamp,
              },
              lastSell: {
                value: r.last_sell_value ? formatEth(r.last_sell_value) : null,
                timestamp: r.last_sell_timestamp,
              },
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
            royaltiesPaid:
              query.includeRoyaltiesPaid && r.royalties_paid !== null
                ? r.royalties_paid
                : undefined,
          },
        };
      });

      return {
        tokens: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
