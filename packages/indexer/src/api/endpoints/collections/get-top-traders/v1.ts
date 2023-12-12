/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { getStartTime } from "@/models/top-selling-collections/top-selling-collections";
import { getTopTraders } from "@/elasticsearch/indexes/activities";

const version = "v1";

export const getCollectionTopTradersV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60 * 60 * 1000,
  },
  description: "Top Traders",
  notes: "Get top traders for a particular collection",
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string()
        .lowercase()
        .required()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
    query: Joi.object({
      period: Joi.string()
        .valid("6h", "1d", "7d")
        .default("1d")
        .description("Time window to aggregate."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(20)
        .description("Amount of items returned in response."),
    }),
  },
  response: {
    schema: Joi.object({
      topTraders: Joi.array().items(
        Joi.object({
          address: Joi.string(),
          volume: Joi.number(),
          count: Joi.number(),
        })
      ),
    }).label(`getTopTraders${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-top-traders-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;
    const { collection } = request.params as any;
    const { period, limit } = query;

    try {
      const startTime = getStartTime(period);

      const topTraders = await getTopTraders({ startTime, collection, limit });

      return {
        topTraders,
      };
    } catch (error) {
      logger.error(`get-owners-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
