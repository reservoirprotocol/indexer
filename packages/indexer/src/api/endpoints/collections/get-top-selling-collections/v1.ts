/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import _ from "lodash";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";

import { redis } from "@/common/redis";

import {
  getTopSellingCollections,
  TopSellingFillOptions,
  getRecentSalesByCollection,
} from "@/elasticsearch/indexes/activities";

import { getJoiPriceObject, JoiPrice } from "@/common/joi";

const version = "v1";

export const getTopSellingCollectionsV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 10000,
  },
  description: "Top Selling Collections",
  notes: "Get top selling and minting collections",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      startTime: Joi.number()
        .greater(Math.floor((Date.now() - 14 * 24 * 60 * 60 * 1000) / 1000))
        .default(Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000))
        .description(
          "Start time in unix timestamp. Must be less than 2 weeks ago. defaults to 24 hours"
        ),
      endTime: Joi.number().description("End time in unix timestamp. defaults to now"),
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
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          id: Joi.string().description("Collection id"),
          name: Joi.string().allow("", null),
          image: Joi.string().allow("", null),
          primaryContract: Joi.string().lowercase().pattern(regex.address),
          count: Joi.number().integer(),
          volume: Joi.number(),
          volumePercentChange: Joi.number().unsafe().allow(null),
          countPercentChange: Joi.number().unsafe().allow(null),
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
  handler: async (request: Request) => {
    const { startTime, endTime, fillType, limit, includeRecentSales } = request.query;

    try {
      const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
      const cacheKey = `top-selling-collections:v2:1d:${fillType}:sales`;

      let cachedResults = null;
      let collectionsResult = [];

      // if approx 24 hours ago, use cache
      if (Math.abs(startTime - oneDayAgo) <= 1000) {
        cachedResults = await redis.get(cacheKey);
      }

      if (cachedResults) {
        collectionsResult = JSON.parse(cachedResults).slice(0, limit);

        let recentSalesPerCollection: any = {};

        if (includeRecentSales) {
          recentSalesPerCollection = await getRecentSalesByCollection(
            collectionsResult.map((collection: any) => collection.id),
            fillType
          );
        }

        collectionsResult = collectionsResult.map((collection: any) => {
          return {
            ...collection,
            recentSales: recentSalesPerCollection[collection.id] ?? [],
          };
        });

        logger.info(
          "get-top-selling-collections-v1-cache-hit",
          `using cached results startTime=${startTime} fillType=${fillType}`
        );
      } else {
        logger.info(
          "get-top-selling-collections-v1-cache-miss",
          `No cached results for startTime=${startTime} fillType=${fillType}`
        );
        collectionsResult = await getTopSellingCollections({
          startTime,
          endTime,
          fillType,
          limit,
          includeRecentSales,
        });

        if (fillType === "mint") {
          await redis.set(cacheKey, JSON.stringify(collectionsResult), "EX", 1800);
        }
      }

      const collections = await Promise.all(
        collectionsResult.map(async (collection: any) => {
          return {
            ...collection,
            recentSales:
              includeRecentSales && collection?.recentSales
                ? await Promise.all(
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
                  )
                : [],
          };
        })
      );

      return {
        collections,
      };
    } catch (error) {
      logger.error(`get-top-selling-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
