/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v1";

export const getUsersLiquidityV1Options: RouteOptions = {
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
        ),
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
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
    })
      .or("collection", "user")
      .oxor("collection", "user"),
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
        SELECT
          "t"."top_buy_maker" AS "user",
          SUM("t"."top_buy_value") as "liquidity",
          MAX("t"."top_buy_value") as "max_top_buy_value",
          RANK() OVER (ORDER BY SUM("t"."top_buy_value") DESC NULLS LAST) AS "rank",
          COUNT(*) AS "token_count"
        FROM "tokens" "t"
      `;

      const conditions: string[] = [`"t"."top_buy_maker" IS NOT NULL`];
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Grouping
      baseQuery += ` GROUP BY "t"."top_buy_maker"`;

      // Sorting
      baseQuery += ` ORDER BY "rank", "t"."top_buy_maker"`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

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

      if (query.user) {
        (query as any).user = toBuffer(query.user);
        baseQuery += ` WHERE "x"."user" = $/user/`;
      }

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
