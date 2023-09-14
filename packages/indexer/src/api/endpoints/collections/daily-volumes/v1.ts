/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth } from "@/common/utils";

const version = "v1";

export const getDailyVolumesV1Options: RouteOptions = {
  description: "Daily collection volume",
  notes: "Get date, volume, rank and sales count for each collection",
  tags: ["api", "Stats"],
  plugins: {
    "hapi-swagger": {
      order: 7,
    },
  },
  validate: {
    query: Joi.object({
      id: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        )
        .required(),
      limit: Joi.number().default(60).description("Amount of items returned in response."),
      startTimestamp: Joi.number().description("The start timestamp you want to filter on (UTC)"),
      endTimestamp: Joi.number().description("The end timestamp you want to filter on (UTC)"),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          timestamp: Joi.number(),
          volume: Joi.number().unsafe(true),
          rank: Joi.number(),
          floor_sell_value: Joi.number().unsafe(true).description("Native currency to chain."),
          sales_count: Joi.number(),
        }).allow(null)
      ),
    }).label(`getDailyVolumes${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-daily-volumes-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    let baseQuery = `
        SELECT
          collection_id AS id,
          timestamp,
          volume_clean AS "volume",
          rank_clean AS "rank",
          floor_sell_value_clean AS "floor_sell_value",
          sales_count_clean AS "sales_count"                   
        FROM daily_volumes
      `;

    baseQuery += ` WHERE collection_id = $/id/`;

    // We default in the code so that these values don't appear in the docs
    if (!query.startTimestamp) {
      query.startTimestamp = 0;
    }
    if (!query.endTimestamp) {
      query.endTimestamp = 9999999999;
    }

    baseQuery += " AND timestamp >= $/startTimestamp/ AND timestamp <= $/endTimestamp/";

    baseQuery += ` ORDER BY timestamp DESC`;

    baseQuery += ` LIMIT $/limit/`;

    try {
      let result = await redb.manyOrNone(baseQuery, query);
      result = result.map((r: any) => ({
        id: r.id,
        timestamp: r.timestamp,
        volume: formatEth(r.volume),
        rank: r.rank,
        floor_sell_value: formatEth(r.floor_sell_value),
        sales_count: r.sales_count,
      }));
      return { collections: result };
    } catch (error: any) {
      logger.error(`get-daily-volumes-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
