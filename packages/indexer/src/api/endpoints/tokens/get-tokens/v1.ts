/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { getJoiTokenObject } from "@/common/joi";

const version = "v1";

export const getTokensV1Options: RouteOptions = {
  description: "List of tokens",
  notes:
    "This API is optimized for quickly fetching a list of tokens in a collection, sorted by price, with only the most important information returned. If you need more metadata, use the `tokens/details` API",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
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
      tokenSetId: Joi.string().description(
        "Filter to a particular set, e.g. `contract:0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
      ),
      onSale: Joi.boolean().description("Limit to tokens that are listed for sale"),
      sortBy: Joi.string()
        .valid("tokenId", "floorAskPrice", "topBidValue")
        .default("floorAskPrice"),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(50).default(20),
    })
      .or("collection", "contract", "token", "tokenSetId")
      .oxor("collection", "contract", "token", "tokenSetId"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/)
            .required(),
          tokenId: Joi.string()
            .pattern(/^[0-9]+$/)
            .required(),
          name: Joi.string().allow("", null),
          image: Joi.string().allow("", null),
          collection: Joi.object({
            id: Joi.string().allow(null),
            name: Joi.string().allow("", null),
          }),
          topBidValue: Joi.number().unsafe().allow(null),
          floorAskPrice: Joi.number().unsafe().allow(null),
        })
      ),
    }).label(`getTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-tokens-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "t"."contract",
          "t"."token_id",
          "t"."name",
          "t"."image",
          "t"."collection_id",
          "t"."metadata_disabled" as "t_metadata_disabled",
          "c"."metadata_disabled" as "c_metadata_disabled",
          "c"."name" as "collection_name",
          "t"."floor_sell_value",
          "t"."top_buy_value"
        FROM "tokens" "t"
        JOIN "collections" "c"
          ON "t"."collection_id" = "c"."id"
      `;

      if (query.tokenSetId) {
        baseQuery += `
          JOIN "token_sets_tokens" "tst"
            ON "t"."contract" = "tst"."contract"
            AND "t"."token_id" = "tst"."token_id"
        `;
      }

      // Filters
      const conditions: string[] = [];
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"t"."contract" = $/contract/`);
      }
      if (query.token) {
        const [contract, tokenId] = query.token.split(":");

        (query as any).contract = toBuffer(contract);
        (query as any).tokenId = tokenId;
        conditions.push(`"t"."contract" = $/contract/`);
        conditions.push(`"t"."token_id" = $/tokenId/`);
      }
      if (query.tokenSetId) {
        conditions.push(`"tst"."token_set_id" = $/tokenSetId/`);
      }
      if (query.onSale === true) {
        conditions.push(`"t"."floor_sell_value" IS NOT NULL`);
      } else if (query.onSale === false) {
        conditions.push(`"t"."floor_sell_value" IS NULL`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      switch (query.sortBy) {
        case "tokenId": {
          baseQuery += ` ORDER BY "t"."token_id" ${query.sortDirection || "ASC"}`;
          break;
        }

        case "topBidValue": {
          baseQuery += ` ORDER BY "t"."top_buy_value" ${
            query.sortDirection || "DESC"
          } NULLS LAST, "t"."token_id"`;
          break;
        }

        case "floorAskPrice":
        default: {
          baseQuery += ` ORDER BY "t"."floor_sell_value" ${
            query.sortDirection || "ASC"
          } NULLS LAST, "t"."token_id"`;
          break;
        }
      }

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await redb.manyOrNone(baseQuery, query).then(async (result) => {
        return result.map((r) =>
          getJoiTokenObject(
            {
              contract: fromBuffer(r.contract),
              tokenId: r.token_id,
              name: r.name,
              image: r.image,
              collection: {
                id: r.collection_id,
                name: r.collection_name,
              },
              floorAskPrice: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
              topBidValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
            },
            r.t_metadata_disabled,
            r.c_metadata_disabled
          )
        );
      });

      return { tokens: await Promise.all(result) };
    } catch (error) {
      logger.error(`get-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
