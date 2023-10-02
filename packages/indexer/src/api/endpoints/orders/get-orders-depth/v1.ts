/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import _ from "lodash";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiOrderDepth, getJoiOrderDepthObject } from "@/common/joi";
import { fromBuffer, regex, toBuffer } from "@/common/utils";
import { Collections } from "@/models/collections";

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
      const side = query.side as "buy" | "sell";

      const limit = 1000;
      const results = await redb.manyOrNone(
        `
          SELECT
            orders.kind,
            orders.price,
            orders.currency_price,
            orders.currency,
            orders.quantity_remaining,
            orders.raw_data,
            orders.fee_bps
          FROM orders
          ${
            query.token
              ? side === "buy"
                ? `
                  JOIN token_sets_tokens
                    ON orders.token_set_id = token_sets_tokens.token_set_id
                `
                : ""
              : ""
          }
          ${
            query.collection
              ? side === "buy"
                ? `
                  JOIN token_sets
                    ON orders.token_set_id = token_sets.id
                    AND orders.token_set_schema_hash = token_sets.schema_hash
                `
                : !query.collection.match(regex.address)
                ? `
                  JOIN token_sets_tokens
                    ON orders.token_set_id = token_sets_tokens.token_set_id
                  JOIN tokens
                    ON token_sets_tokens.contract = tokens.contract
                    AND token_sets_tokens.token_id = tokens.token_id
                `
                : ""
              : ""
          }
          WHERE orders.side = $/side/
            AND orders.fillability_status = 'fillable'
            AND orders.approval_status = 'approved'
            ${
              query.token
                ? side === "buy"
                  ? `
                    AND token_sets_tokens.contract = $/contract/
                    AND token_sets_tokens.token_id = $/tokenId/
                  `
                  : " AND orders.token_set_id = $/tokenSetId/"
                : ""
            }
            ${
              query.collection
                ? side === "buy"
                  ? `
                    AND token_sets.collection_id = $/collection/
                    AND token_sets.attribute_id IS NULL
                  `
                  : !query.collection.match(regex.address)
                  ? `
                    AND orders.contract = $/contract/
                    AND tokens.collection_id = $/collection/
                  `
                  : " AND orders.contract = $/contract/"
                : ""
            }
          ORDER BY orders.value ${side === "buy" ? "DESC" : ""}
          LIMIT $/limit/
        `,
        {
          side,
          contract: query.token
            ? toBuffer(query.token.split(":")[0])
            : query.collection.match(regex.address)
            ? toBuffer(query.collection)
            : toBuffer(
                await Collections.getById(query.collection).then((c) => c!.contract ?? "0x")
              ),
          tokenId: query.token && query.token.split(":")[1],
          tokenSetId: query.token && `token:${query.token}`,
          collection: query.collection,
          limit,
        }
      );

      const depth = await Promise.all(
        results.map(async (r) =>
          getJoiOrderDepthObject(
            r.kind,
            r.currency_price ?? r.price,
            fromBuffer(r.currency),
            r.quantity_remaining,
            r.raw_data,
            side === "buy" ? r.fee_bps : undefined,
            query.displayCurrency
          )
        )
      )
        .then((r) => r.flat())
        .then((r) =>
          _.reduce(
            r,
            (aggregate, value) => {
              const currentQuantity = aggregate.get(value.price);
              if (currentQuantity) {
                aggregate.set(value.price, currentQuantity + value.quantity);
              } else {
                aggregate.set(value.price, value.quantity);
              }
              return aggregate;
            },
            new Map<number, number>()
          )
        )
        .then((r) => [...r.entries()])
        .then((r) => r.map(([price, quantity]) => ({ price, quantity })))
        .then((r) => _.orderBy(r, ["price"], [side === "buy" ? "desc" : "asc"]));

      return { depth };
    } catch (error) {
      logger.error(`get-orders-depth-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
