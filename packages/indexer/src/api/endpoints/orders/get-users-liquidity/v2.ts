/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v2";

export const getUsersLiquidityV2Options: RouteOptions = {
  description: "User bid liquidity rankings",
  notes:
    "This API calculates the total liquidity created by users, based on the number of tokens they are top bidder for.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 7,
    },
  },
  validate: {
    query: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        )
        .required(),
      offset: Joi.number()
        .integer()
        .min(0)
        .max(10000)
        .default(0)
        .description("Use offset to request the next batch of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(20)
        .default(20)
        .description("Amount of items returned in response."),
    }),
  },
  response: {
    schema: Joi.object({
      liquidity: Joi.array().items(
        Joi.object({
          user: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/),
          rank: Joi.number().required(),
          tokenCount: Joi.string().required(),
          liquidity: Joi.number().unsafe().required(),
          maxTopBuyValue: Joi.number().unsafe().required(),
          wethBalance: Joi.number().unsafe().required(),
        })
      ),
    }).label(`getUsersLiquidity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-users-liquidity-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT maker AS "user",
               SUM(value) as "liquidity",
               MAX(value) as "max_top_buy_value",
               RANK() OVER (ORDER BY SUM(value) DESC NULLS LAST) AS "rank",
               COUNT(*) AS "token_count"
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
        GROUP BY maker
        ORDER BY rank, maker
        OFFSET $/offset/
        LIMIT $/limit/
      `;

      baseQuery = `
        WITH "x" AS (${baseQuery})
        SELECT
          "x".*,
          (
            SELECT
              COALESCE("fb"."amount", 0)
            FROM "ft_balances" "fb"
            WHERE "fb"."contract" = $/weth/
              and "fb"."owner" = "x"."user"
              and "fb"."amount" > 0
          ) AS "weth_balance"
        FROM "x"
      `;

      (query as any).weth = toBuffer(Sdk.Common.Addresses.WNative[config.chainId]);

      const result = await redb.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          user: fromBuffer(r.user),
          rank: Number(r.rank),
          liquidity: formatEth(r.liquidity),
          maxTopBuyValue: formatEth(r.max_top_buy_value),
          tokenCount: String(r.token_count),
          wethBalance: r.weth_balance ? formatEth(r.weth_balance) : null,
        }))
      );

      return { liquidity: result };
    } catch (error) {
      logger.error(`get-users-liquidity-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
