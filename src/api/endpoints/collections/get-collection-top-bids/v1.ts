/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth } from "@/common/utils";

const version = "v1";

export const getCollectionTopBidsV1Options: RouteOptions = {
  description: "Top bids for all tokens in a collection",
  notes:
    "When users are placing collection or trait bids, this API can be used to show them where the bid is in the context of other bids, and how many tokens it will be the top bid for.",
  tags: ["api", "4. NFT API"],
  plugins: {
    "hapi-swagger": {
      order: 16,
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
  },
  response: {
    schema: Joi.object({
      topBids: Joi.array().items(
        Joi.object({
          value: Joi.number().unsafe(),
          quantity: Joi.number(),
        })
      ),
    }).label(`getCollectionTopBids${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-collection-top-bids-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      const baseQuery = `
        SELECT
          "t"."top_buy_value" AS "value",
          COUNT(*) AS "quantity"
        FROM "tokens" "t"
        WHERE "t"."collection_id" = $/collection/
          AND "t"."top_buy_value" IS NOT NULL
        GROUP BY "t"."top_buy_value"
        ORDER BY "t"."top_buy_value" DESC NULLS LAST
      `;

      const result = await edb.manyOrNone(baseQuery, params).then((result) =>
        result.map((r) => ({
          value: formatEth(r.value),
          quantity: Number(r.quantity),
        }))
      );

      return { topBids: result };
    } catch (error) {
      logger.error(
        `get-collection-top-bids-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
