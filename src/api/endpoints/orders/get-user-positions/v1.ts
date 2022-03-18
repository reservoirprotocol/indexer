/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, toBuffer } from "@/common/utils";

const version = "v1";

export const getUserPositionsV1Options: RouteOptions = {
  description: "User positions",
  notes:
    "Get aggregate user liquidity, grouped by collection. Useful for showing a summary of liquidity being provided (orders made).",
  tags: ["api", "4. NFT API"],
  plugins: {
    "hapi-swagger": {
      order: 33,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
    }),
    query: Joi.object({
      side: Joi.string().lowercase().valid("buy", "sell").required(),
      status: Joi.string().lowercase().valid("valid", "invalid").required(),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      positions: Joi.array().items(
        Joi.object({
          set: {
            id: Joi.string(),
            schema: Joi.any(),
            metadata: Joi.any(),
            sampleImages: Joi.array().items(Joi.string().allow(null, "")),
            image: Joi.string().allow(null, ""),
            floorAskPrice: Joi.number().unsafe().allow(null),
            topBidValue: Joi.number().unsafe().allow(null),
          },
          primaryOrder: {
            id: Joi.string().allow(null),
            value: Joi.number().unsafe().allow(null),
            expiration: Joi.number().unsafe().allow(null),
          },
          totalValid: Joi.number().allow(null),
        })
      ),
    }).label(`getUserPositions${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-user-positions-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      let baseQuery: string;

      (params as any).user = toBuffer(params.user);
      if (query.status === "valid") {
        baseQuery = `
          SELECT DISTINCT ON ("o"."token_set_id")
            "o"."id",
            "o"."token_set_id",
            "o"."value",
            coalesce(nullif(date_part('epoch', "o"."expiration"), 'Infinity'), 0) AS "expiration",
            (COUNT(*) OVER (PARTITION BY "o"."token_set_id")) AS "total_valid",
            "ts"."schema",
            "ts"."metadata"
          FROM "orders" "o"
          JOIN "token_sets" "ts"
            ON "o"."token_set_id" = "ts"."id"
          WHERE ("o"."fillability_status" = 'fillable' AND "o"."approval_status" = 'approved')
            AND "o"."side" = $/side/
            AND "o"."maker" = $/user/
          ORDER BY "o"."token_set_id", "o"."value"
        `;
      } else if (query.status === "invalid") {
        baseQuery = `
          SELECT DISTINCT ON ("o"."token_set_id")
            "o"."id",
            "o"."token_set_id",
            "o"."value",
            coalesce(nullif(date_part('epoch', "o"."expiration"), 'Infinity'), 0) AS "expiration",
            0 AS "total_valid",
            "ts"."schema",
            "ts"."metadata"
          FROM "orders" "o"
          JOIN "token_sets" "ts"
            ON "o"."token_set_id" = "ts"."id"
          WHERE ("o"."fillability_status" != 'fillable' OR "o"."approval_status" != 'approved')
            AND "o"."side" = $/side/
            AND "o"."maker" = $/user/
          ORDER BY "o"."token_set_id", "o"."expiration" DESC
        `;
      }

      baseQuery = `
        WITH "x" AS (${baseQuery!})
        SELECT
          "x".*,
          array(
            SELECT
              "t"."image"
            FROM "tokens" "t"
            JOIN "token_sets_tokens" "tst"
              ON "t"."contract" = "tst"."contract"
              AND "t"."token_id" = "tst"."token_id"
            WHERE "tst"."token_set_id" = "x"."token_set_id"
            LIMIT 4
          ) AS "sample_images",
          (
            SELECT
              MIN("o"."value") AS "floor_sell_value"
            FROM "orders" "o"
            WHERE "o"."token_set_id" = "x"."token_set_id"
              AND "o"."side" = 'sell'
              AND ("o"."fillability_status" = 'fillable' AND "o"."approval_status" = 'approved')
          ),
          (
            SELECT
              MIN("o"."value") AS "top_buy_value"
            FROM "orders" "o"
            WHERE "o"."token_set_id" = "x"."token_set_id"
              AND "o"."side" = 'buy'
              AND ("o"."fillability_status" = 'fillable' AND "o"."approval_status" = 'approved')
          )
        FROM "x"
      `;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await edb
        .manyOrNone(baseQuery, { ...query, ...params })
        .then((result) =>
          result.map((r) => ({
            set: {
              id: r.token_set_id,
              schema: r.schema,
              metadata: r.metadata,
              sampleImages: r.sample_images || [],
              floorAskPrice: r.floor_sell_value
                ? formatEth(r.floor_sell_value)
                : null,
              topBidValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
            },
            primaryOrder: {
              value: r.value ? formatEth(r.value) : null,
              expiration: r.expiration,
              id: r.id,
            },
            totalValid: Number(r.total_valid),
          }))
        );

      return { positions: result };
    } catch (error) {
      logger.error(
        `get-users-positions-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
