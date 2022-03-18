/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v2";

export const getUserTokensV2Options: RouteOptions = {
  description: "User tokens",
  notes:
    "Get tokens held by a user, along with ownership information such as associated orders and date acquired.",
  tags: ["api", "4. NFT API"],
  plugins: {
    "hapi-swagger": {
      order: 32,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required()
        .description(
          "Wallet to see results for e.g. `0xf296178d553c8ec21a2fbd2c5dda8ca9ac905a00`"
        ),
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
        .pattern(/^0x[a-f0-9]{40}$/)
        .description(
          "Filter to a particular contract, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
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
            name: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow(null, ""),
            }),
            topBid: Joi.object({
              id: Joi.string().allow(null),
              value: Joi.number().unsafe().allow(null),
            }),
          }),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            floorSellValue: Joi.number().unsafe().allow(null),
          }),
        })
      ),
    }).label(`getUserTokens${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-user-tokens-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    // Filters
    (params as any).user = toBuffer(params.user);
    (params as any).offset = query.offset;
    (params as any).limit = query.limit;

    let communityFilter = "";
    if (query.community) {
      (params as any).community = query.community;
      communityFilter = `AND c.community = $/community/`;
    }

    let collectionFilter = "";
    if (query.collection) {
      (params as any).collection = query.collection;
      collectionFilter = `AND t.collection_id = $/collection/`;
    }

    try {
      const baseQuery = `
        SELECT  b.contract, b.token_id, b.token_count, t.name,
               t.image, t.collection_id, t.floor_sell_id, t.top_buy_id,
               t.top_buy_value, t.total_buy_value, c.name as collection_name,
               (
                    CASE WHEN t.floor_sell_value IS NOT NULL
                    THEN 1
                    ELSE 0
                    END
               ) AS on_sale_count
        FROM (
            SELECT amount AS token_count, token_id, contract
            FROM nft_balances
            WHERE owner =  $/user/
            AND amount > 0
          ) AS b
          JOIN LATERAL (
            SELECT t.token_id, t.name, t.image, t.collection_id,
               t.floor_sell_id, t.top_buy_id, t.top_buy_value,
               t.floor_sell_value, b.token_count * t.top_buy_value AS total_buy_value
            FROM tokens t
            WHERE b.token_id = t.token_id
            AND b.contract = t.contract
            ${collectionFilter}
            ORDER BY t.top_buy_value DESC NULLS LAST
          ) t ON TRUE
          JOIN collections c ON c.contract = b.contract
          ${communityFilter}
        OFFSET $/offset/
        LIMIT $/limit/
      `;

      const result = await edb
        .manyOrNone(baseQuery, { ...query, ...params })
        .then((result) =>
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
              },
            },
            ownership: {
              tokenCount: String(r.token_count),
              onSaleCount: String(r.on_sale_count),
              floorSellValue: r.floor_sell_value
                ? formatEth(r.floor_sell_value)
                : null,
            },
          }))
        );

      return { tokens: result };
    } catch (error) {
      logger.error(
        `get-user-tokens-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
