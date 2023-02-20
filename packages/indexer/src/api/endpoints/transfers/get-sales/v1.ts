/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getSalesV1Options: RouteOptions = {
  description: "Historical sales",
  notes: "Get recent sales for a contract or token.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      // TODO: Look into optimizing filtering by collection
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular contract, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Filter to a particular token, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(100).default(20),
    })
      .oxor("contract", "token")
      .or("contract", "token"),
  },
  response: {
    schema: Joi.object({
      sales: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string()
              .lowercase()
              .pattern(/^0x[a-fA-F0-9]{40}$/),
            tokenId: Joi.string().pattern(/^[0-9]+$/),
            name: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow("", null),
            }),
          }),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/),
          taker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/),
          amount: Joi.string(),
          txHash: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{64}$/),
          timestamp: Joi.number(),
          price: Joi.number().unsafe().allow(null),
        })
      ),
    }).label(`getSales${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-sales-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "fe"."contract",
          "fe"."token_id",
          "t"."name",
          "t"."image",
          "t"."collection_id",
          "c"."name" AS "collection_name",
          "fe"."maker",
          "fe"."taker",
          "fe"."amount",
          "fe"."tx_hash",
          "fe"."timestamp",
          "fe"."price"
        FROM "fill_events_2" "fe"
        JOIN "tokens" "t"
          ON "fe"."contract" = "t"."contract"
          AND "fe"."token_id" = "t"."token_id"
        JOIN "collections" "c"
          ON "t"."collection_id" = "c"."id"
      `;

      // Filters
      const conditions: string[] = [];
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"fe"."contract" = $/contract/`);
      }
      if (query.token) {
        const [contract, tokenId] = query.token.split(":");

        (query as any).contract = toBuffer(contract);
        (query as any).tokenId = tokenId;
        conditions.push(`"t"."contract" = $/contract/`);
        conditions.push(`"t"."token_id" = $/tokenId/`);
      }
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY "fe"."block" DESC`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await redb.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          token: {
            contract: fromBuffer(r.contract),
            tokenId: r.token_id,
            name: r.name,
            image: r.mage,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
            },
          },
          maker: fromBuffer(r.maker),
          taker: fromBuffer(r.taker),
          amount: String(r.amount),
          txHash: fromBuffer(r.tx_hash),
          timestamp: r.timestamp,
          price: r.price ? formatEth(r.price) : null,
        }))
      );

      return { sales: result };
    } catch (error) {
      logger.error(`get-sales-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
