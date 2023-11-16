/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth } from "@/common/utils";

const version = "v1";

export const getCollectionTopBidsV1Options: RouteOptions = {
  description: "Bid distribution",
  notes:
    "When users are placing collection or trait bids, this API can be used to show them where the bid is in the context of other bids, and how many tokens it will be the top bid for.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 5,
      deprecated: true,
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
      logger.error(`get-collection-top-bids-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      const baseQuery = `
        SELECT "y"."value", COUNT(*) AS "quantity"
        FROM (
          SELECT contract, token_id
          FROM tokens
          WHERE collection_id = $/collection/
          ORDER BY contract, token_id ASC
        ) "x" LEFT JOIN LATERAL (
          SELECT
            "o"."id" as "order_id",
            "o"."value",
            "o"."maker"
          FROM "orders" "o"
          JOIN "token_sets_tokens" "tst" ON "o"."token_set_id" = "tst"."token_set_id"
          WHERE "tst"."contract" = "x"."contract"
          AND "tst"."token_id" = "x"."token_id"
          AND "o"."side" = 'buy'
          AND "o"."fillability_status" = 'fillable'
          AND "o"."approval_status" = 'approved'
          AND EXISTS(
            SELECT FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "x"."contract"
            AND "nb"."token_id" = "x"."token_id"
            AND "nb"."amount" > 0
            AND "nb"."owner" != "o"."maker"
          )
          ORDER BY "o"."value" DESC
          LIMIT 1
        ) "y" ON TRUE
        WHERE value IS NOT NULL
        GROUP BY y.value
        ORDER BY y.value DESC NULLS LAST
      `;

      const result = await redb.manyOrNone(baseQuery, params).then((result) =>
        result.map((r) => ({
          value: formatEth(r.value),
          quantity: Number(r.quantity),
        }))
      );

      return { topBids: result };
    } catch (error) {
      logger.error(`get-collection-top-bids-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
