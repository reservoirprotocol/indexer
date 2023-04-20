/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiOrderDepth, getJoiBidDepthObject } from "@/common/joi";
import { bn, fromBuffer, regex, toBuffer } from "@/common/utils";

const version = "v1";

export const getOrdersDepthV1Options: RouteOptions = {
  description: "Orders depth",
  notes: "Get the depth of a token or collection.",
  tags: ["api", "Orders"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      side: Joi.string().lowercase().valid("buy", "sell").required(),
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`."
        ),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`."
        ),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Return all prices in this currency."),
    }).oxor("token", "collection"),
  },
  response: {
    schema: Joi.object({
      depth: JoiOrderDepth,
    }).label(`getOrdersDepth${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-orders-depth-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const limit = 1000;
      const results = await redb.manyOrNone(
        `
          SELECT
            orders.kind,
            orders.price,
            orders.currency,
            orders.quantity_remaining,
            orders.raw_data,
            orders.fee_bps
          FROM orders
          ${
            query.token
              ? `
                JOIN token_sets_tokens
                  ON token_sets_tokens.token_set_id = orders.token_set_id
              `
              : ""
          }
          ${
            query.collection
              ? `
                JOIN token_sets
                  ON token_sets.id = orders.token_set_id
                  AND token_sets.schema_hash = orders.token_set_schema_hash
              `
              : ""
          }
          WHERE orders.side = $/side/
            AND orders.fillability_status = 'fillable'
            AND orders.approval_status = 'approved'
            ${
              query.token
                ? `
                  AND token_sets_tokens.contract = $/contract/
                  AND token_sets_tokens.token_id = $/tokenId/
                `
                : ""
            }
            ${
              query.collection
                ? `
                  AND token_sets.collection_id = $/collection/
                  AND token_sets.attribute_id IS NULL
                `
                : ""
            }
          ORDER BY orders.value DESC
          LIMIT $/limit/
        `,
        {
          side: query.side,
          contract: query.token && toBuffer(query.token.split(":")[0]),
          tokenId: query.token && query.token.split(":")[1],
          collection: query.collection,
          limit,
        }
      );

      const depth = await Promise.all(
        results.map(async (r) =>
          getJoiBidDepthObject(
            r.kind,
            r.price,
            fromBuffer(r.currency),
            r.quantity_remaining,
            r.raw_data,
            r.fee_bps
          )
        )
      ).then((r) =>
        r
          .flat()
          .sort((a, b) =>
            bn(a.price.netAmount?.raw ?? a.price.amount.raw).lte(
              bn(b.price.netAmount?.raw ?? b.price.amount.raw)
            )
              ? -1
              : 1
          )
      );

      return { depth };
    } catch (error) {
      logger.error(`get-orders-depth-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
