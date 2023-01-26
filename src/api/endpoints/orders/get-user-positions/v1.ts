/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, toBuffer } from "@/common/utils";
import { JoiAttributeKeyValueObject } from "@/common/joi";

const version = "v1";

export const getUserPositionsV1Options: RouteOptions = {
  description: "Get a summary of a users bids and asks",
  notes:
    "Get aggregate user liquidity, grouped by collection. Useful for showing a summary of liquidity being provided (orders made).",
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
        .required()
        .description("Wallet to see results for e.g. `0xf296178d553c8ec21a2fbd2c5dda8ca9ac905a00`"),
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
            metadata: Joi.alternatives(
              Joi.object({
                kind: "token",
                data: Joi.object({
                  collectionName: Joi.string().allow("", null),
                  tokenName: Joi.string().allow("", null),
                  image: Joi.string().allow("", null),
                }),
              }),
              Joi.object({
                kind: "collection",
                data: Joi.object({
                  collectionName: Joi.string().allow("", null),
                  image: Joi.string().allow("", null),
                }),
              }),
              Joi.object({
                kind: "attribute",
                data: Joi.object({
                  collectionName: Joi.string().allow("", null),
                  attributes: Joi.array().items(JoiAttributeKeyValueObject),
                  image: Joi.string().allow("", null),
                }),
              })
            ).allow(null),
            sampleImages: Joi.array().items(Joi.string().allow("", null)),
            image: Joi.string().allow("", null),
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
      logger.error(`get-user-positions-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const query = request.query as any;

    try {
      const metadataBuildQuery = `
        (
          CASE
            WHEN orders.token_set_id LIKE 'token:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'token',
                  'data', json_build_object(
                    'collectionName', collections.name,
                    'tokenName', tokens.name,
                    'image', tokens.image
                  )
                )
              FROM tokens
              JOIN collections
                ON tokens.collection_id = collections.id
              WHERE tokens.contract = decode(substring(split_part(orders.token_set_id, ':', 2) from 3), 'hex')
                AND tokens.token_id = (split_part(orders.token_set_id, ':', 3)::NUMERIC(78, 0)))

            WHEN orders.token_set_id LIKE 'contract:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collectionName', collections.name,
                    'image', (collections.metadata ->> 'imageUrl')::TEXT
                  )
                )
              FROM collections
              WHERE collections.id = substring(orders.token_set_id from 10))

            WHEN orders.token_set_id LIKE 'range:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'collection',
                  'data', json_build_object(
                    'collectionName', collections.name,
                    'image', (collections.metadata ->> 'imageUrl')::TEXT
                  )
                )
              FROM collections
              WHERE collections.id = substring(orders.token_set_id from 7))

            WHEN orders.token_set_id LIKE 'list:%' THEN
              (SELECT
                json_build_object(
                  'kind', 'attribute',
                  'data', json_build_object(
                    'collectionName', collections.name,
                    'attributes', ARRAY[json_build_object('key', attribute_keys.key, 'value', attributes.value)],
                    'image', (collections.metadata ->> 'imageUrl')::TEXT
                  )
                )
              FROM token_sets
              JOIN attributes
                ON token_sets.attribute_id = attributes.id
              JOIN attribute_keys
                ON attributes.attribute_key_id = attribute_keys.id
              JOIN collections
                ON attribute_keys.collection_id = collections.id
              WHERE token_sets.id = orders.token_set_id)

            ELSE NULL
          END
        ) AS metadata
      `;

      let baseQuery: string;

      (params as any).user = toBuffer(params.user);
      if (query.status === "valid") {
        baseQuery = `
          SELECT DISTINCT ON (orders.token_set_id)
            orders.id,
            orders.token_set_id,
            orders.value,
            coalesce(nullif(date_part('epoch', orders.expiration), 'Infinity'), 0) AS expiration,
            (COUNT(*) OVER (PARTITION BY orders.token_set_id)) AS total_valid,
            ${metadataBuildQuery}
          FROM orders
          WHERE (orders.fillability_status = 'fillable' AND orders.approval_status = 'approved')
            AND orders.side = $/side/
            AND orders.maker = $/user/
          ORDER BY orders.token_set_id, orders.value
        `;
      } else if (query.status === "invalid") {
        baseQuery = `
          SELECT DISTINCT ON (orders.token_set_id)
            orders.id,
            orders.token_set_id,
            orders.value,
            coalesce(nullif(date_part('epoch', orders.expiration), 'Infinity'), 0) AS expiration,
            0 AS total_valid,
            ${metadataBuildQuery}
          FROM orders
          WHERE (orders.fillability_status != 'fillable' OR orders.approval_status != 'approved')
            AND orders.side = $/side/
            AND orders.maker = $/user/
          ORDER BY orders.token_set_id, orders.expiration DESC
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

      const result = await redb.manyOrNone(baseQuery, { ...query, ...params }).then((result) =>
        result.map((r) => ({
          set: {
            id: r.token_set_id,
            metadata: r.metadata,
            sampleImages: r.sample_images || [],
            floorAskPrice: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
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
      logger.error(`get-users-positions-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
