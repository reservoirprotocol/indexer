/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import _ from "lodash";
import Joi from "joi";
import { logger } from "@/common/logger";
import { fromBuffer, regex, toBuffer } from "@/common/utils";
import { redb } from "@/common/db";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";

import {
  getTopSellingCollections,
  TopSellingFillOptions,
} from "@/elasticsearch/indexes/activities";

import { getJoiPriceObject, JoiPrice } from "@/common/joi";
import { Sources } from "@/models/sources";

const version = "v2";

export const getTopSellingCollectionsV2Options: RouteOptions = {
  cache: {
    privacy: "public",
  },
  description: "Top Selling Collections",
  notes: "Get top selling and minting collections",
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({
      period: Joi.string().valid("5m", "30m", "1h", "6h", "24h").default("24h"),
      fillType: Joi.string()
        .lowercase()
        .valid(..._.values(TopSellingFillOptions))
        .default(TopSellingFillOptions.any)
        .description("Fill types to aggregate from (sale, mint, any)"),

      limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(25)
        .description("Amount of items returned in response. Default is 25 and max is 50"),

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
          description: Joi.string().allow("", null),
          primaryContract: Joi.string().lowercase().pattern(regex.address),
          count: Joi.number().integer(),
          volume: Joi.number(),
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
    let cacheTime = 60 * 60;
    const {
      period,
      fillType,
      limit,
      includeRecentSales,
      normalizeRoyalties,
      useNonFlaggedFloorAsk,
    } = request.query;
    const now = Math.floor(new Date().getTime() / 1000);
    try {
      let startTime = now - 60 * 24 * 60;

      switch (period) {
        case "5m": {
          startTime = now - 5 * 60;
          cacheTime = 60 * 1;
          break;
        }
        case "30m": {
          startTime = now - 30 * 60;
          cacheTime = 60 * 10;
          break;
        }
        case "1h": {
          startTime = now - 60 * 1 * 60;
          cacheTime = 60 * 30;
          break;
        }
        case "6h": {
          startTime = now - 60 * 6 * 60;
          break;
        }
      }

      const collectionsResult = await getTopSellingCollections({
        startTime,
        fillType,
        limit,
        includeRecentSales,
      });

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

      request.query.contract = collectionsResult.map((collection: any) =>
        toBuffer(collection.primaryContract)
      );

      const baseQuery = `
        SELECT
          collections.id,
          collections.contract,
          (collections.metadata ->> 'description')::TEXT AS "description",
          ${floorAskSelectQuery}
          FROM collections
          WHERE collections.contract IN ($/contract:csv/)
      `;

      const resultsPromise = redb.manyOrNone(baseQuery, request.query);
      const recentSalesPromise = collectionsResult.map(async (collection: any) => {
        return {
          ...collection,
          recentSales: await Promise.all(
            collection.recentSales.map(async (sale: any) => {
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
          ),
        };
      });

      const responses = await Promise.all([resultsPromise, ...recentSalesPromise]);
      const collectionMetadataResponse = responses.shift();
      const collectionsMetadata: Record<string, any> = {};
      if (collectionMetadataResponse && Array.isArray(collectionMetadataResponse)) {
        collectionMetadataResponse.forEach((metadata: any) => {
          collectionsMetadata[fromBuffer(metadata.contract)] = metadata;
        });
      }
      const sources = await Sources.getInstance();
      const collections = await Promise.all(
        responses.map(async (response) => {
          const metadata = collectionsMetadata[(response as any).primaryContract] || {};
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

          return { ...response, description: metadata.description, floorAsk };
        })
      );
      const response = h.response({ collections });
      response.header("cache-control", `${cacheTime}`);
      return response;
    } catch (error) {
      logger.error(`get-top-selling-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
