/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getUserTokensV1Options: RouteOptions = {
  description: "User tokens",
  notes:
    "Get tokens held by a user, along with ownership information such as associated orders and date acquired.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required(),
    }),
    query: Joi.object({
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community, e.g. `artblocks`"),
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
      hasOffer: Joi.boolean(),
      sortBy: Joi.string().valid("topBuyValue"),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string(),
            tokenId: Joi.string(),
            name: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow("", null),
            }),
            topBid: Joi.object({
              id: Joi.string().allow(null),
              value: Joi.number().unsafe().allow(null),
              schema: Joi.object().allow(null),
            }),
          }),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            floorSellValue: Joi.number().unsafe().allow(null),
            acquiredAt: Joi.number().allow(null),
          }),
        })
      ),
    }).label(`getUserTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-tokens-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT DISTINCT ON ("t"."contract", "t"."token_id")
          "t"."contract",
          "t"."token_id",
          "t"."name",
          "t"."image",
          "t"."collection_id",
          "c"."name" as "collection_name",
          "nb"."amount" as "token_count",
          (CASE WHEN "t"."floor_sell_value" IS NOT NULL
            THEN 1
            ELSE 0
          END) AS "on_sale_count",
          "t"."floor_sell_id",
          "t"."top_buy_id",
          "t"."top_buy_value",
          "ts"."schema" AS "top_buy_schema",
          "nb"."amount" * "t"."top_buy_value" AS "total_buy_value",
          (
            SELECT "nte"."timestamp" FROM "nft_transfer_events" "nte"
            WHERE "nte"."address" = "t"."contract"
              AND "nte"."token_id" = "t"."token_id"
              AND "nte"."to" = $/user/
            ORDER BY "nte"."timestamp" DESC
            LIMIT 1
          ) AS "acquired_at"
        FROM "nft_balances" "nb"
        JOIN "tokens" "t"
          ON "nb"."contract" = "t"."contract"
          AND "nb"."token_id" = "t"."token_id"
        JOIN "collections" "c"
          ON "t"."collection_id" = "c"."id"
        LEFT JOIN "orders" "o"
          ON "t"."top_buy_id" = "o"."id"
        LEFT JOIN "token_sets" "ts"
          ON "o"."token_set_id" = "ts"."id"
      `;

      // Filters
      (params as any).user = toBuffer(params.user);
      const conditions: string[] = [`"nb"."owner" = $/user/`, `"nb"."amount" > 0`];
      if (query.community) {
        conditions.push(`"c"."community" = $/community/`);
      }
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (query.hasOffer) {
        conditions.push(`"t"."top_buy_value" IS NOT NULL`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // https://stackoverflow.com/a/18939498
      baseQuery = `SELECT "x".* FROM (${baseQuery}) "x"`;

      switch (query.sortBy) {
        case "topBuyValue":
        default: {
          baseQuery += `
            ORDER BY
              "x"."top_buy_value" ${query.sortDirection || "DESC"} NULLS LAST,
              "x"."contract",
              "x"."token_id"
          `;
          break;
        }
      }

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await redb.manyOrNone(baseQuery, { ...query, ...params }).then((result) =>
        result.map((r) => ({
          token: {
            contract: fromBuffer(r.contract),
            tokenId: r.token_id,
            name: r.name,
            image: r.image,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
            },
            topBid: {
              id: r.top_buy_id,
              value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
              schema: r.top_buy_schema,
            },
          },
          ownership: {
            tokenCount: String(r.token_count),
            onSaleCount: String(r.on_sale_count),
            floorSellValue: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
            acquiredAt: Number(r.acquired_at),
          },
        }))
      );

      return { tokens: result };
    } catch (error) {
      logger.error(`get-user-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
