/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, toBuffer } from "@/common/utils";
import { getJoiCollectionObject } from "@/common/joi";

const version = "v1";

export const getUserCollectionsV1Options: RouteOptions = {
  description: "Get aggregate stats for a user, grouped by collection",
  notes:
    "Get aggregate stats for a user, grouped by collection. Useful for showing total portfolio information.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 31,
      deprecated: true,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .description("Wallet to see results for e.g. `0xf296178d553c8ec21a2fbd2c5dda8ca9ac905a00`"),
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
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      collections: Joi.array().items(
        Joi.object({
          collection: Joi.object({
            id: Joi.string(),
            name: Joi.string().allow("", null),
            metadata: Joi.object({
              imageUrl: Joi.string().allow("", null),
              discordUrl: Joi.string().allow("", null),
              description: Joi.string().allow("", null),
              externalUrl: Joi.string().allow("", null),
              bannerImageUrl: Joi.string().allow("", null),
              twitterUsername: Joi.string().allow("", null),
            }).allow(null),
            floorAskPrice: Joi.number().unsafe().allow(null),
            topBidValue: Joi.number().unsafe().allow(null),
          }),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            liquidCount: Joi.string(),
          }),
        })
      ),
    }).label(`getUserCollections${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-user-collections-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT  collections.id,
                collections.name,
                collections.metadata,
                collections.metadata_disabled,
                SUM(nft_balances.amount) AS token_count,
                MAX(tokens.top_buy_value) AS top_buy_value,
                MIN(tokens.floor_sell_value) AS floor_sell_value,
                SUM(CASE WHEN tokens.floor_sell_value IS NULL THEN 0 ELSE 1 END) AS on_sale_count,
                SUM(CASE WHEN tokens.top_buy_value IS NULL THEN 0 ELSE 1 END) AS liquid_count
        FROM nft_balances
        JOIN tokens ON nft_balances.contract = tokens.contract AND nft_balances.token_id = tokens.token_id
        JOIN collections ON tokens.collection_id = collections.id
      `;

      // Filters
      (params as any).user = toBuffer(params.user);
      const conditions: string[] = [`nft_balances.owner = $/user/`, `nft_balances.amount > 0`];

      if (query.community) {
        conditions.push(`collections.community = $/community/`);
      }
      if (query.collection) {
        conditions.push(`collections.id = $/collection/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Grouping
      baseQuery += ` GROUP BY collections.id, nft_balances.owner`;

      // Sorting
      baseQuery += ` ORDER BY collections.all_time_volume DESC`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      const result = await redb.manyOrNone(baseQuery, { ...params, ...query });
      const collections = _.map(result, (r) => ({
        collection: getJoiCollectionObject(
          {
            id: r.id,
            name: r.name,
            metadata: r.metadata,
            floorAskPrice: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
            topBidValue: r.top_buy_value ? formatEth(r.top_buy_value) : null,
          },
          r.metadata_disabled
        ),
        ownership: {
          tokenCount: String(r.token_count),
          onSaleCount: String(r.on_sale_count),
          liquidCount: String(r.liquid_count),
        },
      }));

      return { collections };
    } catch (error) {
      logger.error(`get-user-collections-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
