/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiPrice, getJoiPriceObject } from "@/common/joi";
import {
  buildContinuation,
  fromBuffer,
  getNetAmount,
  regex,
  splitContinuation,
} from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";

const version = "v2";

export const getOrdersAllV2Options: RouteOptions = {
  description: "Bulk historical orders",
  notes:
    "This API is designed for efficiently ingesting large volumes of orders, for external processing",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      id: Joi.alternatives(Joi.string(), Joi.array().items(Joi.string())).description(
        "Order id(s)."
      ),
      source: Joi.string().description("Filter to a source by domain. Example: `opensea.io`"),
      native: Joi.boolean().description("If true, results will filter only Reservoir orders."),
      side: Joi.string().valid("sell", "buy").default("sell").description("Sell or buy side."),
      includeMetadata: Joi.boolean()
        .default(false)
        .description("If true, metadata will be included in the response."),
      includeRawData: Joi.boolean()
        .default(false)
        .description("If true, raw data will be included in the response."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(50)
        .description("Amount of items returned in response."),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Return result in given currency"),
    }).oxor("id", "source", "native"),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          kind: Joi.string().required(),
          side: Joi.string().valid("buy", "sell").required(),
          tokenSetId: Joi.string().required(),
          tokenSetSchemaHash: Joi.string().lowercase().pattern(regex.bytes32).required(),
          contract: Joi.string().lowercase().pattern(regex.address),
          maker: Joi.string().lowercase().pattern(regex.address).required(),
          taker: Joi.string().lowercase().pattern(regex.address).required(),
          price: JoiPrice,
          validFrom: Joi.number().required(),
          validUntil: Joi.number().required(),
          source: Joi.string().allow("", null),
          feeBps: Joi.number().allow(null),
          feeBreakdown: Joi.array()
            .items(
              Joi.object({
                kind: Joi.string(),
                recipient: Joi.string().allow("", null),
                // Should be `Joi.number().allow(null)` but we set to `Joi.any()` to cover
                // objects eith wrong schema that were inserted by mistake into the db
                bps: Joi.any(),
              })
            )
            .allow(null),
          status: Joi.string(),
          expiration: Joi.number().required(),
          createdAt: Joi.string().required(),
          updatedAt: Joi.string().required(),
          metadata: Joi.object().allow(null),
          rawData: Joi.object().allow(null),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getOrdersAll${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-orders-all-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
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
              WHERE token_sets.id = orders.token_set_id AND token_sets.schema_hash = orders.token_set_schema_hash)

            ELSE NULL
          END
        ) AS metadata
      `;

      let baseQuery = `
        SELECT
          orders.id,
          orders.kind,
          orders.side,
          orders.token_set_id,
          orders.token_set_schema_hash,
          orders.contract,
          orders.maker,
          orders.taker,
          orders.price,
          orders.value,
          DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          orders.source_id_int,
          orders.fee_bps,
          orders.fee_breakdown,
          COALESCE(
            NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'),
            0
          ) AS expiration,
          extract(epoch from orders.created_at) AS created_at,
          (
            CASE
              WHEN orders.fillability_status = 'filled' THEN 'filled'
              WHEN orders.fillability_status = 'cancelled' THEN 'cancelled'
              WHEN orders.fillability_status = 'expired' THEN 'expired'
              WHEN orders.fillability_status = 'no-balance' THEN 'inactive'
              WHEN orders.approval_status = 'no-approval' THEN 'inactive'
              ELSE 'active'
            END
          ) AS status,
          ${query.includeRawData ? `orders.raw_data,` : ""}
          ${query.includeMetadata ? `${metadataBuildQuery},` : ""}
          orders.updated_at
        FROM orders
      `;

      // Filters
      const conditions: string[] = [];
      if (query.id) {
        if (Array.isArray(query.id)) {
          conditions.push(`orders.id IN ($/id:csv/)`);
        } else {
          conditions.push(`orders.id = $/id/`);
        }
      } else {
        conditions.push(`orders.side = $/side/`);
        conditions.push(
          `orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance'`
        );

        if (query.source) {
          const sources = await Sources.getInstance();
          let source;

          // Try to get the source by name
          source = sources.getByName(query.source, false);

          // If the source was not found try to get it by domain
          if (!source) {
            source = sources.getByDomain(query.source, false);
          }

          if (!source) {
            return { orders: [] };
          }

          (query as any).source = source.id;
          conditions.push(`orders.source_id_int = $/source/`);
        }
        if (query.native) {
          conditions.push(`orders.is_reservoir`);
        }
        if (query.continuation) {
          const [createdAt, id] = splitContinuation(
            query.continuation,
            /^\d+(.\d+)?_0x[a-f0-9]{64}$/
          );
          (query as any).createdAt = createdAt;
          (query as any).id = id;

          conditions.push(`(orders.created_at, orders.id) < (to_timestamp($/createdAt/), $/id/)`);
        }
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY orders.created_at DESC, orders.id DESC`;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation = buildContinuation(
          rawResult[rawResult.length - 1].created_at + "_" + rawResult[rawResult.length - 1].id
        );
      }

      const sources = await Sources.getInstance();
      const result = rawResult.map(async (r) => ({
        id: r.id,
        kind: r.kind,
        side: r.side,
        tokenSetId: r.token_set_id,
        tokenSetSchemaHash: fromBuffer(r.token_set_schema_hash),
        contract: fromBuffer(r.contract),
        maker: fromBuffer(r.maker),
        taker: fromBuffer(r.taker),
        price: await getJoiPriceObject(
          {
            gross: {
              amount: r.currency_price ?? r.price,
              nativeAmount: r.price,
            },
            net: {
              amount: getNetAmount(r.currency_price ?? r.price, r.fee_bps),
              nativeAmount: getNetAmount(r.price, r.fee_bps),
            },
          },
          r.currency
            ? fromBuffer(r.currency)
            : r.side === "sell"
            ? Sdk.Common.Addresses.Native[config.chainId]
            : Sdk.Common.Addresses.WNative[config.chainId],
          query.displayCurrency
        ),
        validFrom: Number(r.valid_from),
        validUntil: Number(r.valid_until),
        source: sources.get(r.source_id_int)?.name,
        feeBps: Number(r.fee_bps),
        feeBreakdown: r.fee_breakdown,
        expiration: Number(r.expiration),
        status: r.status,
        createdAt: new Date(r.created_at * 1000).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
        rawData: r.raw_data ?? undefined,
        metadata: r.metadata ?? undefined,
      }));

      return {
        orders: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-orders-all-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
