/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { CollectionSets } from "@/models/collection-sets";
import { Assets } from "@/utils/assets";

const version = "v3";

export const getUserTokensV3Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "User Tokens",
  notes:
    "Get tokens held by a user, along with ownership information such as associated orders and date acquired.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 9,
    },
  },
  validate: {
    params: Joi.object({
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
    }),
    query: Joi.object({
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community, e.g. `artblocks`"),
      collectionsSetId: Joi.string()
        .lowercase()
        .description("Filter to a particular collection set."),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular contract, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      sortBy: Joi.string()
        .valid("acquiredAt")
        .description("Order the items are returned in the response."),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("desc")
        .description("Order the items are returned in the response."),
      offset: Joi.number()
        .integer()
        .min(0)
        .max(10000)
        .default(0)
        .description("Use offset to request the next batch of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(100)
        .default(20)
        .description("Amount of items returned in response."),
      includeTopBid: Joi.boolean()
        .default(false)
        .description("If true, top bid will be returned in the response."),
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
              imageUrl: Joi.string().allow(null),
              floorAskPrice: Joi.number().unsafe().allow(null),
            }),
            topBid: Joi.object({
              id: Joi.string().allow(null),
              value: Joi.number().unsafe().allow(null),
            }).optional(),
          }),
          ownership: Joi.object({
            tokenCount: Joi.string(),
            onSaleCount: Joi.string(),
            floorAskPrice: Joi.number().unsafe().allow(null),
            acquiredAt: Joi.string().allow(null),
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

    // Filters
    (params as any).user = toBuffer(params.user);
    (params as any).offset = query.offset;
    (params as any).limit = query.limit;

    const collectionFilters: string[] = [];
    const addCollectionToFilter = (id: string) => {
      const i = collectionFilters.length;
      if (id.match(/^0x[a-f0-9]{40}:\d+:\d+$/g)) {
        const [contract, startTokenId, endTokenId] = id.split(":");

        (query as any)[`contract${i}`] = toBuffer(contract);
        (query as any)[`startTokenId${i}`] = startTokenId;
        (query as any)[`endTokenId${i}`] = endTokenId;
        collectionFilters.push(`
          (nft_balances.contract = $/contract${i}/
          AND nft_balances.token_id >= $/startTokenId${i}/
          AND nft_balances.token_id <= $/endTokenId${i}/)
        `);
      } else {
        (query as any)[`contract${i}`] = toBuffer(id);
        collectionFilters.push(`(nft_balances.contract = $/contract${i}/)`);
      }
    };

    if (query.community) {
      await redb
        .manyOrNone(
          `
          SELECT collections.id FROM collections
          WHERE collections.community = $/community/
        `,
          { community: query.community }
        )
        .then((result) => result.forEach(({ id }) => addCollectionToFilter(id)));

      if (!collectionFilters.length) {
        return { tokens: [] };
      }
    }

    if (query.collectionsSetId) {
      await CollectionSets.getCollectionsIds(query.collectionsSetId).then((result) =>
        result.forEach(addCollectionToFilter)
      );

      if (!collectionFilters.length) {
        return { tokens: [] };
      }
    }

    if (query.collection) {
      addCollectionToFilter(query.collection);
    }

    let sortByFilter = "";
    switch (query.sortBy) {
      case "acquiredAt": {
        sortByFilter = `
            ORDER BY
              b.acquired_at ${query.sortDirection}
          `;
        break;
      }
    }

    let tokensJoin = `
      JOIN LATERAL (
        SELECT t.token_id, t.name, t.image, t.collection_id, null AS top_bid_id, null AS top_bid_value
        FROM tokens t
        WHERE b.token_id = t.token_id
        AND b.contract = t.contract
      ) t ON TRUE
    `;

    if (query.includeTopBid) {
      tokensJoin = `
        JOIN LATERAL (
          SELECT t.token_id, t.name, t.image, t.collection_id
          FROM tokens t
          WHERE b.token_id = t.token_id
          AND b.contract = t.contract
        ) t ON TRUE
        LEFT JOIN LATERAL (
          SELECT "o"."id" AS "top_bid_id", o.value AS "top_bid_value"
          FROM "orders" "o"
          JOIN "token_sets_tokens" "tst" ON "o"."token_set_id" = "tst"."token_set_id"
          WHERE "tst"."contract" = "b"."contract"
          AND "tst"."token_id" = "b"."token_id"
          AND "o"."side" = 'buy'
          AND "o"."fillability_status" = 'fillable'
          AND "o"."approval_status" = 'approved'
          AND EXISTS(
            SELECT FROM "nft_balances" "nb"
              WHERE "nb"."contract" = "b"."contract"
              AND "nb"."token_id" = "b"."token_id"
              AND "nb"."amount" > 0
              AND "nb"."owner" != "o"."maker"
          )
          ORDER BY "o"."value" DESC
          LIMIT 1
        ) "y" ON TRUE
      `;
    }

    try {
      const baseQuery = `
        SELECT b.contract, b.token_id, b.token_count, b.acquired_at, t.name,
               t.image, t.collection_id, b.floor_sell_id, b.floor_sell_value, top_bid_id,
               top_bid_value, c.name as collection_name, c.metadata,
               c.floor_sell_value AS "collection_floor_sell_value",
               (
                    CASE WHEN b.floor_sell_value IS NOT NULL
                    THEN 1
                    ELSE 0
                    END
               ) AS on_sale_count
        FROM (
            SELECT amount AS token_count, token_id, contract, acquired_at, floor_sell_id, floor_sell_value
            FROM nft_balances
            WHERE owner = $/user/
              AND ${collectionFilters.length ? "(" + collectionFilters.join(" OR ") + ")" : "TRUE"}
              AND amount > 0
          ) AS b
          ${tokensJoin}
          JOIN collections c ON c.id = t.collection_id
        ${sortByFilter}
        OFFSET $/offset/
        LIMIT $/limit/
      `;

      const userTokens = await redb.manyOrNone(baseQuery, { ...query, ...params });

      const result = _.map(userTokens, (r) => ({
        token: {
          contract: fromBuffer(r.contract),
          tokenId: r.token_id,
          name: r.name,
          image: Assets.getLocalAssetsLink(r.image),
          collection: {
            id: r.collection_id,
            name: r.collection_name,
            imageUrl: Assets.getLocalAssetsLink(r.metadata?.imageUrl),
            floorAskPrice: r.collection_floor_sell_value
              ? formatEth(r.collection_floor_sell_value)
              : null,
          },
          topBid: query.includeTopBid
            ? {
                id: r.top_bid_id,
                value: r.top_bid_value ? formatEth(r.top_bid_value) : null,
              }
            : undefined,
        },
        ownership: {
          tokenCount: String(r.token_count),
          onSaleCount: String(r.on_sale_count),
          floorAskPrice: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
          acquiredAt: r.acquired_at ? new Date(r.acquired_at).toISOString() : null,
        },
      }));

      return { tokens: result };
    } catch (error) {
      logger.error(`get-user-tokens-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
