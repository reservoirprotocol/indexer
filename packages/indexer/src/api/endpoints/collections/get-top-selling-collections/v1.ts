/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import _ from "lodash";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";

import {
  getTopSellingCollections,
  TopSellingFillOptions,
} from "@/elasticsearch/indexes/activities";

const version = "v5";

export const getTopSellingCollectionsOptions: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 10000,
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
          recentSales: Joi.array().items(
            Joi.object({
              contract: Joi.string(),
              type: Joi.string(),
              timestamp: Joi.number(),
              toAddress: Joi.string(),
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
      const collections = await getTopSellingCollections({
        startTime,
        endTime,
        fillType,
        limit,
        includeRecentSales,
      });

      return {
        collections,
      };
    } catch (error) {
      logger.error(`get-top-selling-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
