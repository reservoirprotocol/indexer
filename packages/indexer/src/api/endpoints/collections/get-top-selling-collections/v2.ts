/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import _ from "lodash";
import Joi from "joi";
import { logger } from "@/common/logger";
import { fromBuffer, regex } from "@/common/utils";
import { redb } from "@/common/db";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { getStartTime } from "@/models/top-selling-collections/top-selling-collections";

import { redis } from "@/common/redis";

import {
  getTopSellingCollectionsV2 as getTopSellingCollections,
  TopSellingFillOptions,
  getRecentSalesByCollection,
} from "@/elasticsearch/indexes/activities";

import { getJoiCollectionObject, getJoiPriceObject, JoiPrice } from "@/common/joi";
import { Sources } from "@/models/sources";

const version = "v2";

export const getTopSellingCollectionsV2Options: RouteOptions = {
  cache: {
    expiresIn: 60 * 1000,
    privacy: "public",
  },
  description: "Top selling collections",
  notes: "Get top selling and minting collections",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      period: Joi.string()
        .valid("5m", "10m", "30m", "1h", "6h", "1d", "24h")
        .default("1d")
        .description("Time window to aggregate."),
      fillType: Joi.string()
        .lowercase()
        .valid(..._.values(TopSellingFillOptions))
        .default(TopSellingFillOptions.sale)
        .description("Fill types to aggregate from (sale, mint, any)"),

      limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(25)
        .description("Amount of items returned in response. Default is 25 and max is 50"),
      sortBy: Joi.string().valid("volume", "sales").default("sales"),

      includeRecentSales: Joi.boolean()
        .default(false)
        .description("If true, 8 recent sales will be included in the response"),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      useNonFlaggedFloorAsk: Joi.boolean()
        .when("normalizeRoyalties", {
          is: Joi.boolean().valid(true),
          then: Joi.valid(false),
        })
        .default(false)
        .description(
          "If true, return the non flagged floor ask. Supported only when `normalizeRoyalties` is false."
        ),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          id: Joi.string().description("Collection id"),
          name: Joi.string().allow("", null),
          image: Joi.string().allow("", null),
          banner: Joi.string().allow("", null),
          description: Joi.string().allow("", null),
          primaryContract: Joi.string().lowercase().pattern(regex.address),
          count: Joi.number().integer(),
          volume: Joi.number(),
          volumePercentChange: Joi.number().unsafe().allow(null),
          countPercentChange: Joi.number().unsafe().allow(null),
          floorAsk: {
            id: Joi.string().allow(null),
            sourceDomain: Joi.string().allow("", null),
            price: JoiPrice.allow(null),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            validFrom: Joi.number().unsafe().allow(null),
            validUntil: Joi.number().unsafe().allow(null),
            token: Joi.object({
              contract: Joi.string().lowercase().pattern(regex.address).allow(null),
              tokenId: Joi.string().pattern(regex.number).allow(null),
              name: Joi.string().allow(null),
              image: Joi.string().allow("", null),
            })
              .allow(null)
              .description("Lowest Ask Price."),
          },
          tokenCount: Joi.number().description("Total tokens within the collection."),
          ownerCount: Joi.number().description("Unique number of owners."),
          volumeChange: Joi.object({
            "1day": Joi.number().unsafe().allow(null),
            "7day": Joi.number().unsafe().allow(null),
            "30day": Joi.number().unsafe().allow(null),
          }).description(
            "Total volume change X-days vs previous X-days. (e.g. 7day [days 1-7] vs 7day prior [days 8-14]). A value over 1 is a positive gain, under 1 is a negative loss. e.g. 1 means no change; 1.1 means 10% increase; 0.9 means 10% decrease."
          ),
          recentSales: Joi.array().items(
            Joi.object({
              contract: Joi.string(),
              type: Joi.string(),
              timestamp: Joi.number(),
              toAddress: Joi.string(),
              price: JoiPrice.allow(null),
              collection: Joi.object({
                name: Joi.string().allow("", null),
                image: Joi.string().allow("", null),
                id: Joi.string(),
              }),
              token: Joi.object({
                name: Joi.string().allow("", null),
                image: Joi.string().allow("", null),
                id: Joi.string(),
              }),
            })
          ),
        })
      ),
    }).label(`getTopSellingCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-top-selling-collections-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request, h) => {
    const {
      fillType,
      limit,
      sortBy,
      includeRecentSales,
      normalizeRoyalties,
      useNonFlaggedFloorAsk,
    } = request.query;

    try {
      let collectionsResult = [];
      const period = request.query.period === "24h" ? "1d" : request.query.period;

      const cacheKey = `top-selling-collections:v2:${period}:${fillType}:${sortBy}`;

      const cachedResults = await redis.get(cacheKey);

      if (cachedResults) {
        collectionsResult = JSON.parse(cachedResults).slice(0, limit);
        logger.info(
          "get-top-selling-collections-v2-cache-hit",
          `Using cached results for ${cacheKey}`
        );
      } else {
        const startTime = getStartTime(period);

        collectionsResult = await getTopSellingCollections({
          startTime,
          fillType,
          limit,
          sortBy,
        });

        logger.info(
          "get-top-selling-collections-v2-cache-miss",
          `No cached results for ${cacheKey}`
        );
      }

      let floorAskSelectQuery;

      if (normalizeRoyalties) {
        floorAskSelectQuery = `
            collections.normalized_floor_sell_id AS floor_sell_id,
            collections.normalized_floor_sell_value AS floor_sell_value,
            collections.normalized_floor_sell_maker AS floor_sell_maker,
            least(2147483647::NUMERIC, date_part('epoch', lower(collections.normalized_floor_sell_valid_between)))::INT AS floor_sell_valid_from,
            least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(collections.normalized_floor_sell_valid_between)), 'Infinity'),0))::INT AS floor_sell_valid_until,
            collections.normalized_floor_sell_source_id_int AS floor_sell_source_id_int
            `;
      } else if (useNonFlaggedFloorAsk) {
        floorAskSelectQuery = `
            collections.non_flagged_floor_sell_id AS floor_sell_id,
            collections.non_flagged_floor_sell_value AS floor_sell_value,
            collections.non_flagged_floor_sell_maker AS floor_sell_maker,
            least(2147483647::NUMERIC, date_part('epoch', lower(collections.non_flagged_floor_sell_valid_between)))::INT AS floor_sell_valid_from,
            least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(collections.non_flagged_floor_sell_valid_between)), 'Infinity'),0))::INT AS floor_sell_valid_until,
            collections.non_flagged_floor_sell_source_id_int AS floor_sell_source_id_int
            `;
      } else {
        floorAskSelectQuery = `
            collections.floor_sell_id,
            collections.floor_sell_value,
            collections.floor_sell_maker,
            least(2147483647::NUMERIC, date_part('epoch', lower(collections.floor_sell_valid_between)))::INT AS floor_sell_valid_from,
            least(2147483647::NUMERIC, coalesce(nullif(date_part('epoch', upper(collections.floor_sell_valid_between)), 'Infinity'),0))::INT AS floor_sell_valid_until,
            collections.floor_sell_source_id_int
      `;
      }

      let collections = [];

      if (collectionsResult.length) {
        const collectionIdList = collectionsResult
          .map((collection: any) => `'${collection.id}'`)
          .join(", ");

        const baseQuery = `
        SELECT
          collections.id,
          collections.name,
          collections.contract,
          collections.token_count,
          collections.owner_count,
          collections.metadata_disabled,
          collections.day1_volume_change,
          collections.day7_volume_change,
          collections.day30_volume_change,
          (collections.metadata ->> 'bannerImageUrl')::TEXT AS "banner",
          (collections.metadata ->> 'imageUrl')::TEXT AS "image",
          (collections.metadata ->> 'description')::TEXT AS "description",
          ${floorAskSelectQuery}
          FROM collections
          WHERE collections.id IN (${collectionIdList})
      `;

        let recentSalesPerCollection: any = {};

        if (includeRecentSales) {
          recentSalesPerCollection = await getRecentSalesByCollection(
            collectionsResult.map((collection: any) => collection.id),
            fillType
          );
        }

        const resultsPromise = redb.manyOrNone(baseQuery);
        const recentSalesPromise = collectionsResult.map(async (collection: any) => {
          const recentSales = recentSalesPerCollection[collection.id] || [];

          return {
            ...collection,
            recentSales: recentSales
              ? await Promise.all(
                  recentSales.map(async (sale: any) => {
                    const { pricing, ...salesData } = sale;
                    const price = pricing
                      ? await getJoiPriceObject(
                          {
                            gross: {
                              amount: String(pricing?.currencyPrice ?? pricing?.price ?? 0),
                              nativeAmount: String(pricing?.price ?? 0),
                              usdAmount: String(pricing.usdPrice ?? 0),
                            },
                          },
                          pricing.currency
                        )
                      : null;

                    return {
                      ...salesData,
                      price,
                    };
                  })
                )
              : [],
          };
        });

        const responses = await Promise.all([resultsPromise, ...recentSalesPromise]);

        const collectionMetadataResponse = responses.shift();
        const collectionsMetadata: Record<string, any> = {};
        if (collectionMetadataResponse && Array.isArray(collectionMetadataResponse)) {
          collectionMetadataResponse.forEach((metadata: any) => {
            collectionsMetadata[metadata.id] = metadata;
          });
        }
        const sources = await Sources.getInstance();

        collections = await Promise.all(
          responses.map(async (response: any) => {
            const metadata = collectionsMetadata[(response as any).id] || {};
            let floorAsk;
            if (metadata) {
              const floorAskCurrency = metadata.floor_sell_currency
                ? fromBuffer(metadata.floor_sell_currency)
                : Sdk.Common.Addresses.Native[config.chainId];
              floorAsk = {
                id: metadata.floor_sell_id,
                sourceDomain: sources.get(metadata.floor_sell_source_id_int)?.domain,
                price: metadata.floor_sell_id
                  ? await getJoiPriceObject(
                      {
                        gross: {
                          amount: metadata.floor_sell_currency_value ?? metadata.floor_sell_value,
                          nativeAmount: metadata.floor_sell_value,
                        },
                      },
                      floorAskCurrency
                    )
                  : null,
              };
            }

            return getJoiCollectionObject(
              {
                ...response,
                volumeChange: {
                  "1day": metadata.day1_volume_change,
                  "7day": metadata.day7_volume_change,
                  "30day": metadata.day30_volume_change,
                },
                name: metadata.name,
                tokenCount: Number(metadata.token_count || 0),
                ownerCount: Number(metadata.owner_count || 0),
                image: metadata.image,
                banner: metadata.banner,
                description: metadata.description,
                floorAsk,
              },
              metadata.metadata_disabled
            );
          })
        );
      }

      return h.response({ collections });
    } catch (error) {
      logger.error(`get-top-selling-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
