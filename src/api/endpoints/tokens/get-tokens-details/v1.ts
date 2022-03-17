/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { getOrderSourceMetadata } from "@/orderbook/orders/utils";

const version = "v1";

export const getTokensDetailsV1Options: RouteOptions = {
  description: "Tokens with metadata",
  notes:
    "Get a list of tokens with full metadata. This is useful for showing a single token page, or scenarios that require more metadata. If you don't need this metadata, you should use the <a href='#/tokens/getTokensV1'>tokens</a> API, which is much faster.",
  tags: ["api", "tokens"],
  validate: {
    query: Joi.object({
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
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}:[0-9]+$/)
        .description(
          "Filter to a particular token, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      tokenSetId: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular set, e.g. `contract:0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      onSale: Joi.boolean().description(
        "Limit to tokens that are listed for sale"
      ),
      sortBy: Joi.string()
        .valid("tokenId", "floorAskPrice", "topBidValue")
        .default("floorAskPrice"),
      sortDirection: Joi.string().lowercase().valid("asc", "desc"),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(50).default(20),
    })
      .or("collection", "contract", "token", "tokenSetId")
      .oxor("collection", "contract", "token", "tokenSetId")
      .with("attributes", "collection"),
  },
  response: {
    schema: Joi.object({
      tokens: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string()
              .lowercase()
              .pattern(/^0x[a-f0-9]{40}$/)
              .required(),
            tokenId: Joi.string()
              .pattern(/^[0-9]+$/)
              .required(),
            name: Joi.string().allow(null, ""),
            description: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow(null, ""),
            }),
            lastBuy: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            lastSell: {
              value: Joi.number().unsafe().allow(null),
              timestamp: Joi.number().unsafe().allow(null),
            },
            owner: Joi.string().required(),
            attributes: Joi.array().items(
              Joi.object({
                key: Joi.string(),
                value: Joi.string(),
              })
            ),
          }),
          market: Joi.object({
            floorAsk: {
              id: Joi.string().allow(null),
              price: Joi.number().unsafe().allow(null),
              maker: Joi.string()
                .lowercase()
                .pattern(/^0x[a-f0-9]{40}$/)
                .allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
              source: Joi.any(),
            },
            topBid: Joi.object({
              id: Joi.string().allow(null),
              value: Joi.number().unsafe().allow(null),
              maker: Joi.string()
                .lowercase()
                .pattern(/^0x[a-f0-9]{40}$/)
                .allow(null),
              validFrom: Joi.number().unsafe().allow(null),
              validUntil: Joi.number().unsafe().allow(null),
            }),
          }),
        })
      ),
    }).label(`getTokensDetails${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-tokens-details-${version}-handler`,
        `Wrong response schema: ${error}`
      );
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
          "t"."description",
          "t"."image",
          "t"."collection_id",
          "c"."name" as "collection_name",
          "t"."last_buy_value",
          "t"."last_buy_timestamp",
          "t"."last_sell_value",
          "t"."last_sell_timestamp",
          (
            SELECT "nb"."owner" FROM "nft_balances" "nb"
            WHERE "nb"."contract" = "t"."contract"
              AND "nb"."token_id" = "t"."token_id"
              AND "nb"."amount" > 0
            LIMIT 1
          ) AS "owner",
          (
            SELECT
              array_agg(json_build_object('key', "ak"."key", 'value', "a"."value"))
            FROM "token_attributes" "ta"
            JOIN "attributes" "a"
              ON "ta"."attribute_id" = "a"."id"
            JOIN "attribute_keys" "ak"
              ON "a"."attribute_key_id" = "ak"."id"
            WHERE "ta"."contract" = "t"."contract"
              AND "ta"."token_id" = "t"."token_id"
          ) AS "attributes",
          "t"."floor_sell_id",
          "t"."floor_sell_value",
          "t"."floor_sell_maker",
          DATE_PART('epoch', LOWER("os"."valid_between")) AS "floor_sell_valid_from",
          COALESCE(
            NULLIF(date_part('epoch', UPPER("os"."valid_between")), 'Infinity'),
            0
          ) AS "floor_sell_valid_until",
          "os"."source_id" AS "floor_sell_source_id",
          "t"."top_buy_id",
          "t"."top_buy_value",
          "t"."top_buy_maker",
          DATE_PART('epoch', LOWER("ob"."valid_between")) AS "top_buy_valid_from",
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER("ob"."valid_between")), 'Infinity'),
            0
          ) AS "top_buy_valid_until"
        FROM "tokens" "t"
        LEFT JOIN "orders" "os"
          ON "t"."floor_sell_id" = "os"."id"
        LEFT JOIN "orders" "ob"
          ON "t"."top_buy_id" = "ob"."id"
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
      if (query.attributes) {
        const attributes: { key: string; value: string }[] = [];
        Object.entries(query.attributes).forEach(([key, values]) => {
          (Array.isArray(values) ? values : [values]).forEach((value) =>
            attributes.push({ key, value })
          );
        });

        for (let i = 0; i < attributes.length; i++) {
          (query as any)[`key${i}`] = attributes[i].key;
          (query as any)[`value${i}`] = attributes[i].value;
          conditions.push(`
            EXISTS (
              SELECT FROM "token_attributes" "ta"
              JOIN "attributes" "a"
                ON "ta"."attribute_id" = "a"."id"
              JOIN "attribute_keys" "ak"
                ON "a"."attribute_key_id" = "ak"."id"
              WHERE "ta"."contract" = "t"."contract"
                AND "ta"."token_id" = "t"."token_id"
                AND "ak"."key" = $/key${i}/
                AND "a"."value" = $/value${i}/
            )
          `);
        }
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
          baseQuery += ` ORDER BY "t"."token_id" ${
            query.sortDirection || "ASC"
          }`;
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

      const result = await edb.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          token: {
            contract: fromBuffer(r.contract),
            tokenId: r.token_id,
            name: r.name,
            description: r.description,
            image: r.image,
            collection: {
              id: r.collection_id,
              name: r.collection_name,
            },
            lastBuy: {
              value: r.last_buy_value ? formatEth(r.last_buy_value) : null,
              timestamp: r.last_buy_timestamp,
            },
            lastSell: {
              value: r.last_sell_value ? formatEth(r.last_sell_value) : null,
              timestamp: r.last_sell_timestamp,
            },
            owner: fromBuffer(r.owner),
            attributes: r.attributes || [],
          },
          market: {
            floorAsk: {
              id: r.floor_sell_id,
              price: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
              maker: r.floor_sell_maker ? fromBuffer(r.floor_sell_maker) : null,
              validFrom: r.floor_sell_valid_from,
              validUntil: r.floor_sell_value ? r.floor_sell_valid_until : null,
              source: r.floor_sell_id
                ? getOrderSourceMetadata(
                    r.floor_sell_source_id
                      ? fromBuffer(r.floor_sell_source_id)
                      : null,
                    fromBuffer(r.contract),
                    r.token_id
                  )
                : null,
            },
            topBid: {
              id: r.top_buy_id,
              value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
              maker: r.top_buy_maker ? fromBuffer(r.top_buy_maker) : null,
              validFrom: r.top_buy_valid_from,
              validUntil: r.top_buy_value ? r.top_buy_valid_until : null,
            },
          },
        }))
      );

      return { tokens: result };
    } catch (error) {
      logger.error(
        `get-tokens-details-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
