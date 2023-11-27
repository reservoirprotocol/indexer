/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  buildContinuation,
  formatEth,
  fromBuffer,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import {
  getJoiDynamicPricingObject,
  getJoiPriceObject,
  getJoiSourceObject,
  getJoiTokenObject,
  JoiDynamicPrice,
  JoiPrice,
  JoiSource,
} from "@/common/joi";
import { Sources } from "@/models/sources";
import _ from "lodash";
import { Assets, ImageSize } from "@/utils/assets";

const version = "v6";

export const getUserTokensV6Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "User Tokens",
  notes:
    "Get tokens held by a user, along with ownership information such as associated orders and date acquired.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 9,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
    }),
    query: Joi.object({
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community, e.g. `artblocks`"),
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set."),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      contract: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Filter to a particular contract, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
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
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      sortBy: Joi.string()
        .valid("acquiredAt", "lastAppraisalValue")
        .default("acquiredAt")
        .description("Order the items are returned in the response."),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("desc")
        .description("Order the items are returned in the response."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(200)
        .default(20)
        .description("Amount of items returned in response."),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
      includeDynamicPricing: Joi.boolean()
        .default(false)
        .description("If true, dynamic pricing data will be returned in the response."),
      useNonFlaggedFloorAsk: Joi.boolean()
        .default(false)
        .description("If true, will return the collection non flagged floor ask."),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Return result in given currency"),
    }),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string(),
            tokenId: Joi.string(),
            kind: Joi.string(),
            name: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            lastBuy: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            lastSell: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            rarityScore: Joi.number().allow(null),
            rarityRank: Joi.number().allow(null),
            media: Joi.string().allow(null),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow("", null),
              imageUrl: Joi.string().allow("", null),
              imageUrlSmall: Joi.string().allow("", null),
              imageUrlLarge: Joi.string().allow("", null),
              floorAskPrice: Joi.number().unsafe().allow(null),
            }),
            topBid: Joi.object({
              id: Joi.string().allow(null),
              price: JoiPrice.allow(null),
            }).optional(),
            lastAppraisalValue: Joi.number().unsafe().allow(null),
          }),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            floorAsk: {
              id: Joi.string().allow(null),
              price: JoiPrice.allow(null),
              maker: Joi.string().lowercase().pattern(regex.address).allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
              dynamicPricing: JoiDynamicPrice.allow(null),
              source: JoiSource.allow(null),
            },
            acquiredAt: Joi.string().allow(null),
          }),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getUserTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-tokens-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    // Filters
    (params as any).user = toBuffer(params.user);

    const tokensCollectionFilters: string[] = [];
    const nftBalanceCollectionFilters: string[] = [];

    const addCollectionToFilter = (id: string) => {
      const i = nftBalanceCollectionFilters.length;

      if (id.match(/^0x[a-f0-9]{40}:\d+:\d+$/g)) {
        // Range based collection
        const [contract, startTokenId, endTokenId] = id.split(":");

        (query as any)[`contract${i}`] = toBuffer(contract);
        (query as any)[`startTokenId${i}`] = startTokenId;
        (query as any)[`endTokenId${i}`] = endTokenId;

        nftBalanceCollectionFilters.push(`
          (nft_balances.contract = $/contract${i}/
          AND nft_balances.token_id >= $/startTokenId${i}/
          AND nft_balances.token_id <= $/endTokenId${i}/)
        `);
      } else if (id.match(/^0x[a-f0-9]{40}:[a-zA-Z]+-.+$/g)) {
        (query as any)[`collection${i}`] = id;

        // List based collections
        tokensCollectionFilters.push(`
          collection_id = $/collection${i}/
        `);
      } else {
        // Contract side collection
        (query as any)[`contract${i}`] = toBuffer(id);
        nftBalanceCollectionFilters.push(`(nft_balances.contract = $/contract${i}/)`);
      }
    };

    if (query.community) {
      await redb
        .manyOrNone(
          `
          SELECT collections.contract
          FROM collections
          WHERE collections.community = $/community/
        `,
          { community: query.community }
        )
        .then((result) =>
          result.forEach(({ contract }) => addCollectionToFilter(fromBuffer(contract)))
        );

      if (!nftBalanceCollectionFilters.length) {
        return { tokens: [] };
      }
    }

    if (query.collectionsSetId) {
      await CollectionSets.getCollectionsIds(query.collectionsSetId).then((result) =>
        result.forEach(addCollectionToFilter)
      );

      if (!nftBalanceCollectionFilters.length) {
        return { tokens: [] };
      }
    }

    if (query.collection) {
      addCollectionToFilter(query.collection);
    }

    if (query.contract) {
      (query as any)[`contract`] = toBuffer(query.contract);
      nftBalanceCollectionFilters.push(`(nft_balances.contract = $/contract/)`);
    }

    const tokensFilter: string[] = [];

    if (query.tokens) {
      if (!_.isArray(query.tokens)) {
        query.tokens = [query.tokens];
      }

      for (const token of query.tokens) {
        const [contract, tokenId] = token.split(":");
        const tokenFilter = `('${_.replace(contract, "0x", "\\x")}', '${tokenId}')`;

        tokensFilter.push(tokenFilter);
      }

      (query as any).tokensFilter = _.join(tokensFilter, ",");
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

    let tokensJoin = `
      JOIN LATERAL (
        SELECT 
          t.token_id,
          t.name,
          t.image,
          t.image_version,
          t.media,
          t.rarity_rank,
          t.collection_id,
          t.metadata_disabled AS "t_metadata_disabled",
          t.rarity_score,
          t.last_buy_value,
          t.last_buy_timestamp,
          t.last_sell_value,
          t.last_sell_timestamp,
          null AS top_bid_id,
          null AS top_bid_price,
          null AS top_bid_value,
          null AS top_bid_currency,
          null AS top_bid_currency_price,
          null AS top_bid_currency_value,
          ${selectFloorData}
        FROM tokens t
        WHERE b.token_id = t.token_id
        AND b.contract = t.contract
        AND ${
          tokensCollectionFilters.length ? "(" + tokensCollectionFilters.join(" OR ") + ")" : "TRUE"
        }
      ) t ON TRUE
    `;

    if (query.includeTopBid) {
      tokensJoin = `
        JOIN LATERAL (
          SELECT 
            t.token_id,
            t.name,
            t.image,
            t.image_version,
            t.media,
            t.rarity_rank,
            t.collection_id,
            t.metadata_disabled AS "t_metadata_disabled",
            t.rarity_score,
            t.last_sell_value,
            t.last_buy_value,
            t.last_sell_timestamp,
            t.last_buy_timestamp,
            ${selectFloorData}
          FROM tokens t
          WHERE b.token_id = t.token_id
          AND b.contract = t.contract
          AND ${
            tokensCollectionFilters.length
              ? "(" + tokensCollectionFilters.join(" OR ") + ")"
              : "TRUE"
          }
        ) t ON TRUE
        LEFT JOIN LATERAL (
          SELECT 
            o.id AS "top_bid_id",
            o.price AS "top_bid_price",
            o.value AS "top_bid_value",
            o.currency AS "top_bid_currency",
            o.currency_price AS "top_bid_currency_price",
            o.currency_value AS "top_bid_currency_value"
          FROM "orders" "o"
          JOIN "token_sets_tokens" "tst" ON "o"."token_set_id" = "tst"."token_set_id"
          WHERE "tst"."contract" = "b"."contract"
          AND "tst"."token_id" = "b"."token_id"
          AND "o"."side" = 'buy'
          AND "o"."fillability_status" = 'fillable'
          AND "o"."approval_status" = 'approved'
          ${query.normalizeRoyalties ? " AND o.normalized_value IS NOT NULL" : ""}
          AND EXISTS(
            SELECT FROM "nft_balances" "nb"
              WHERE "nb"."contract" = "b"."contract"
              AND "nb"."token_id" = "b"."token_id"
              AND "nb"."amount" > 0
              AND "nb"."owner" != "o"."maker"
          )
          ORDER BY "o"."value" DESC
          LIMIT 1
        ) "y" ON TRUE
      `;
    }

    try {
      let baseQuery = `
        SELECT b.contract, b.token_id, b.token_count, extract(epoch from b.acquired_at) AS acquired_at, b.last_token_appraisal_value,
               t.name, t.image, t.image_version, t.media, t.rarity_rank, t.collection_id, t.floor_sell_id, t.floor_sell_value, t.floor_sell_currency, t.floor_sell_currency_value,
               t.floor_sell_maker, t.floor_sell_valid_from, t.floor_sell_valid_to, t.floor_sell_source_id_int,
               t.rarity_score, t.last_sell_value, t.last_buy_value, t.last_sell_timestamp, t.last_buy_timestamp,
               top_bid_id, top_bid_price, top_bid_value, top_bid_currency, top_bid_currency_price, top_bid_currency_value,
               c.metadata_disabled AS "c_metadata_disabled", t_metadata_disabled, c.name as collection_name, con.kind, c.metadata, ${
                 query.useNonFlaggedFloorAsk
                   ? "c.floor_sell_value"
                   : "c.non_flagged_floor_sell_value"
               } AS "collection_floor_sell_value",
               (
                    CASE WHEN t.floor_sell_value IS NOT NULL
                    THEN 1
                    ELSE 0
                    END
               ) AS on_sale_count
               ${selectIncludeDynamicPricing}
        FROM (
            SELECT amount AS token_count, token_id, contract, acquired_at, last_token_appraisal_value
            FROM nft_balances
            WHERE owner = $/user/
              AND ${
                nftBalanceCollectionFilters.length
                  ? "(" + nftBalanceCollectionFilters.join(" OR ") + ")"
                  : "TRUE"
              }
              AND ${
                tokensFilter.length
                  ? "(nft_balances.contract, nft_balances.token_id) IN ($/tokensFilter:raw/)"
                  : "TRUE"
              }
              AND amount > 0
          ) AS b
          ${tokensJoin}
          ${includeDynamicPricingQuery}
          JOIN collections c ON c.id = t.collection_id
          JOIN contracts con ON b.contract = con.address
      `;

      const conditions: string[] = [];

      if (query.continuation) {
        const [acquiredAtOrLastAppraisalValue, collectionId, tokenId] = splitContinuation(
          query.continuation,
          /^[0-9]+_[A-Za-z0-9:-]+_[0-9]+$/
        );

        (query as any).acquiredAtOrLastAppraisalValue = acquiredAtOrLastAppraisalValue;
        (query as any).collectionId = collectionId;
        (query as any).tokenId = tokenId;

        query.sortDirection = query.sortDirection || "desc";

        if (query.sortBy === "acquiredAt") {
          conditions.push(
            `(acquired_at, b.token_id) ${
              query.sortDirection == "desc" ? "<" : ">"
            } (to_timestamp($/acquiredAtOrLastAppraisalValue/), $/tokenId/)`
          );
        } else {
          conditions.push(
            `(last_token_appraisal_value, b.token_id) ${
              query.sortDirection == "desc" ? "<" : ">"
            } ($/acquiredAtOrLastAppraisalValue/, $/tokenId/)`
          );
        }
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      if (query.sortBy === "acquiredAt") {
        baseQuery += `
        ORDER BY
          acquired_at ${query.sortDirection}, b.token_id ${query.sortDirection}
        LIMIT $/limit/
      `;
      } else {
        baseQuery += `
        ORDER BY
          last_token_appraisal_value ${query.sortDirection} NULLS LAST, b.token_id ${query.sortDirection}
        LIMIT $/limit/
      `;
      }

      const userTokens = await redb.manyOrNone(baseQuery, { ...query, ...params });

      let continuation = null;
      if (userTokens.length === query.limit) {
        if (query.sortBy === "acquiredAt") {
          continuation = buildContinuation(
            _.toInteger(userTokens[userTokens.length - 1].acquired_at) +
              "_" +
              userTokens[userTokens.length - 1].collection_id +
              "_" +
              userTokens[userTokens.length - 1].token_id
          );
        } else {
          continuation = buildContinuation(
            _.toInteger(userTokens[userTokens.length - 1].last_token_appraisal_value) +
              "_" +
              userTokens[userTokens.length - 1].collection_id +
              "_" +
              userTokens[userTokens.length - 1].token_id
          );
        }
      }

      const sources = await Sources.getInstance();
      const result = userTokens.map(async (r) => {
        const contract = fromBuffer(r.contract);
        const tokenId = r.token_id;

        // Use default currencies for backwards compatibility with entries
        // that don't have the currencies cached in the tokens table
        const floorAskCurrency = r.floor_sell_currency
          ? fromBuffer(r.floor_sell_currency)
          : Sdk.Common.Addresses.Native[config.chainId];
        const topBidCurrency = r.top_bid_currency
          ? fromBuffer(r.top_bid_currency)
          : Sdk.Common.Addresses.WNative[config.chainId];
        const floorSellSource = r.floor_sell_value
          ? sources.get(Number(r.floor_sell_source_id_int), contract, tokenId)
          : undefined;
        const acquiredTime = new Date(r.acquired_at * 1000).toISOString();

        return {
          token: getJoiTokenObject(
            {
              contract: contract,
              tokenId: tokenId,
              kind: r.kind,
              name: r.name,
              image: Assets.getResizedImageUrl(r.image, undefined, r.image_version),
              lastBuy: {
                value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
                timestamp: r.last_buy_timestamp,
              },
              lastSell: {
                value: r.last_sell_value ? formatEth(r.last_sell_value) : null,
                timestamp: r.last_sell_timestamp,
              },
              rarityScore: r.rarity_score,
              rarityRank: r.rarity_rank,
              media: r.media,
              collection: {
                id: r.collection_id,
                name: r.collection_name,
                imageUrl: Assets.getResizedImageUrl(
                  r.metadata?.imageUrl,
                  undefined,
                  r.image_version
                ),
                imageUrlSmall: Assets.getResizedImageUrl(
                  r.metadata?.imageUrl,
                  ImageSize.small,
                  r.image_version
                ),
                imageUrlLarge: Assets.getResizedImageUrl(
                  r.metadata?.imageUrl,
                  ImageSize.large,
                  r.image_version
                ),
                floorAskPrice: r.collection_floor_sell_value
                  ? formatEth(r.collection_floor_sell_value)
                  : null,
              },
              topBid: query.includeTopBid
                ? {
                    id: r.top_bid_id,
                    price: r.top_bid_value
                      ? await getJoiPriceObject(
                          {
                            net: {
                              amount: r.top_bid_currency_value ?? r.top_bid_value,
                              nativeAmount: r.top_bid_value,
                            },
                            gross: {
                              amount: r.top_bid_currency_price ?? r.top_bid_price,
                              nativeAmount: r.top_bid_price,
                            },
                          },
                          topBidCurrency,
                          query.displayCurrency
                        )
                      : null,
                  }
                : undefined,
              lastAppraisalValue: r.last_token_appraisal_value
                ? formatEth(r.last_token_appraisal_value)
                : null,
            },
            r.t_metadata_disabled,
            r.c_metadata_disabled
          ),
          ownership: {
            tokenCount: String(r.token_count),
            onSaleCount: String(r.on_sale_count),
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
              dynamicPricing: query.includeDynamicPricing
                ? await getJoiDynamicPricingObject(
                    r.floor_sell_dynamic,
                    r.floor_sell_order_kind,
                    query.normalizeRoyalties,
                    r.floor_sell_raw_data,
                    r.floor_sell_currency ? fromBuffer(r.floor_sell_currency) : undefined,
                    r.floor_sell_missing_royalties ? r.floor_sell_missing_royalties : undefined
                  )
                : null,
              source: getJoiSourceObject(floorSellSource),
            },
            acquiredAt: acquiredTime,
          },
        };
      });

      return {
        tokens: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-user-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
