/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth } from "@/common/utils";
import { Sources } from "@/models/sources";

const version = "v1";

export const getSourcesListingsV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 30000,
  },
  description: "Collection Source Stats",
  notes: "This API returns aggregated listings info for the given collection per source",
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
        .required()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
  },
  response: {
    schema: Joi.object({
      sources: Joi.array().items(
        Joi.object({
          onSaleCount: Joi.number(),
          sourceDomain: Joi.string().allow("", null),
          floorAskPrice: Joi.number().unsafe().allow(null),
        })
      ),
    }).label(`getSourcesListings${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-sources-listings-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const baseQuery = `
        SELECT source_id_int, count(DISTINCT token_id) AS "on_sale_count", MIN(value) AS "floor_sell_value"
        FROM (
          SELECT contract, token_id
          FROM tokens
          WHERE collection_id = $/collection/
          AND floor_sell_value IS NOT NULL
        ) "x" JOIN LATERAL (
          SELECT orders.value, orders.source_id_int
          FROM orders
          JOIN token_sets_tokens ON orders.token_set_id = token_sets_tokens.token_set_id
          WHERE token_sets_tokens.contract = x.contract
          AND token_sets_tokens.token_id = x.token_id
          AND orders.side = 'sell'
          AND orders.fillability_status = 'fillable'
          AND orders.approval_status = 'approved'
        ) "y" ON TRUE
        GROUP BY source_id_int
        ORDER BY on_sale_count DESC
      `;

      const rawResult = await redb.manyOrNone(baseQuery, query);
      const sources = await Sources.getInstance();

      const result = await Promise.all(
        rawResult.map(async (r) => ({
          sourceDomain: sources.get(r.source_id_int)?.domain,
          onSaleCount: Number(r.on_sale_count),
          floorAskPrice: formatEth(r.floor_sell_value),
        }))
      );

      return {
        sources: result,
      };
    } catch (error) {
      logger.error(`get-sources-listings-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
