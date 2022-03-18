/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, toBuffer } from "@/common/utils";

const version = "v1";

export const getTokensFloorV1Options: RouteOptions = {
  description:
    "Get the current best price of every on sale token in a collection",
  notes:
    "This API will return the best price of every token in a collection that is currently on sale",
  tags: ["api", "2. Aggregator"],
  plugins: {
    "hapi-swagger": {
      order: 2,
    },
  },
  validate: {
    query: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .description(
          "Filter to a particular contract, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    })
      .or("collection", "contract")
      .oxor("collection", "contract"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.object().pattern(/^[0-9]+$/, Joi.number().unsafe()),
    }).label(`getTokensFloor${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-tokens-floor-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "t"."token_id",
          "t"."floor_sell_value"
        FROM "tokens" "t"
      `;

      // Filters
      const conditions: string[] = [`"t"."floor_sell_value" IS NOT NULL`];
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"t"."contract" = $/contract/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      const result = await edb
        .manyOrNone(baseQuery, query)
        .then((result) =>
          Object.fromEntries(
            result.map((r) => [r.token_id, formatEth(r.floor_sell_value)])
          )
        );

      return { tokens: result };
    } catch (error) {
      logger.error(
        `get-tokens-floor-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
