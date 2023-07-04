/* eslint-disable @typescript-eslint/no-explicit-any */

import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";

import { getChainStatsFromActivity } from "@/elasticsearch/indexes/activities";

const version = "v5";

export const getChainStats: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 10000,
  },
  description: "Chain Stats",
  notes: "Get chain mint and sales stats for 1 and 7 days",
  tags: ["api", "Chain"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({}),
  },
  response: {
    schema: Joi.object({
      stats: Joi.object({
        "1day": Joi.object({
          mintCount: Joi.number(),
          saleCount: Joi.number(),
          totalCount: Joi.number(),
          mintVolume: Joi.number(),
          saleVolume: Joi.number(),
          totalVolume: Joi.number(),
        }),
        "7day": Joi.object({
          mintCount: Joi.number(),
          saleCount: Joi.number(),
          totalCount: Joi.number(),
          mintVolume: Joi.number(),
          saleVolume: Joi.number(),
          totalVolume: Joi.number(),
        }),
      }),
    }).label(`getChainStats${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-chain-stats-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async () => {
    try {
      const stats = await getChainStatsFromActivity();

      return {
        stats,
      };
    } catch (error) {
      logger.error(`get-chain-stats-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
