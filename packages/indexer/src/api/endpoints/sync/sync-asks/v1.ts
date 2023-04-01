/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";
import _ from "lodash";

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
import { SourcesEntity } from "@/models/sources/sources-entity";

const version = "v1";

export const getSyncOrdersAsksV1Options: RouteOptions = {
  description: "Sync Asks (listings)",
  notes:
    "This API is optimized for bulk access to asks (listings) for syncing a remote database. Thus it offers minimal filters/metadata.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      sortBy: Joi.string()
        .valid("createdAt", "updatedAt")
        .default("updatedAt")
        .description("Order the items are returned in the response."),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("desc")
        .description("Direction to order the items which are returned in the response."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(5000)
        .default(50)
        .description("Amount of items returned in response."),
    }),
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
          normalizedPrice: JoiPrice,
          validFrom: Joi.number().required(),
          validUntil: Joi.number().required(),
          quantityFilled: Joi.number().unsafe(),
          quantityRemaining: Joi.number().unsafe(),
          status: Joi.string(),
          source: Joi.object().allow(null),
          feeBps: Joi.number().allow(null),
          feeBreakdown: Joi.array()
            .items(
              Joi.object({
                kind: Joi.string(),
                recipient: Joi.string().allow("", null),
                bps: Joi.number(),
              })
            )
            .allow(null),
          missingRoyalties: Joi.array()
            .items(
              Joi.object({
                amount: Joi.string(),
                recipient: Joi.string().allow("", null),
                bps: Joi.number(),
              })
            )
            .allow(null),
          expiration: Joi.number().required(),
          isReservoir: Joi.boolean().allow(null),
          isDynamic: Joi.boolean(),
          createdAt: Joi.string().required(),
          updatedAt: Joi.string().required(),
          rawData: Joi.object().allow(null),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getOrdersAsks${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-orders-asks-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
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
          orders.currency,
          orders.price,
          orders.value,
          orders.currency_price,
          orders.currency_value,
          orders.normalized_value,
          orders.currency_normalized_value,
          orders.missing_royalties,
          orders.dynamic,
          DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          orders.source_id_int,
          orders.quantity_filled,
          orders.quantity_remaining,
          coalesce(orders.fee_bps, 0) AS fee_bps,
          orders.fee_breakdown,
          COALESCE(
            NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'),
            0
          ) AS expiration,
          orders.is_reservoir,
          extract(epoch from orders.created_at) AS created_at,
          extract(epoch from orders.updated_at) AS updated_at,
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
          orders.raw_data
        FROM orders
      `;

      // Filters
      const conditions: string[] = [`orders.side = 'sell'`];

      /* if (!query.includePrivate) {
        conditions.push(
          `orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL`
        );
      } */

      if (query.continuation) {
        const [createdAtOrUpdatedAt, id] = splitContinuation(
          query.continuation,
          /^\d+(.\d+)?_0x[a-f0-9]{64}$/
        );
        (query as any).createdAtOrUpdatedAt = createdAtOrUpdatedAt;
        (query as any).id = id;

        if (query.sortBy === "updatedAt") {
          if (query.sortDirection === "asc") {
            conditions.push(
              `(orders.updated_at, orders.id) > (to_timestamp($/priceOrCreatedAtOrUpdatedAt/), $/id/)`
            );
          } else {
            conditions.push(
              `(orders.updated_at, orders.id) < (to_timestamp($/priceOrCreatedAtOrUpdatedAt/), $/id/)`
            );
          }
        } else {
          if (query.sortDirection === "asc") {
            conditions.push(
              `(orders.created_at, orders.id) > (to_timestamp($/priceOrCreatedAtOrUpdatedAt/), $/id/)`
            );
          } else {
            conditions.push(
              `(orders.created_at, orders.id) < (to_timestamp($/priceOrCreatedAtOrUpdatedAt/), $/id/)`
            );
          }
        }
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      if (query.sortBy === "updatedAt") {
        if (query.sortDirection === "asc") {
          baseQuery += ` ORDER BY orders.updated_at ASC, orders.id ASC`;
        } else {
          baseQuery += ` ORDER BY orders.updated_at DESC, orders.id DESC`;
        }
      } else {
        if (query.sortDirection === "asc") {
          baseQuery += ` ORDER BY orders.created_at ASC, orders.id ASC`;
        } else {
          baseQuery += ` ORDER BY orders.created_at DESC, orders.id DESC`;
        }
      }

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        if (query.sortBy === "updatedAt") {
          continuation = buildContinuation(
            rawResult[rawResult.length - 1].updated_at + "_" + rawResult[rawResult.length - 1].id
          );
        } else {
          continuation = buildContinuation(
            rawResult[rawResult.length - 1].created_at + "_" + rawResult[rawResult.length - 1].id
          );
        }
      }

      const sources = await Sources.getInstance();
      const result = rawResult.map(async (r) => {
        let source: SourcesEntity | undefined;
        if (r.token_set_id?.startsWith("token")) {
          const [, contract, tokenId] = r.token_set_id.split(":");
          source = sources.get(Number(r.source_id_int), contract, tokenId);
        } else {
          source = sources.get(Number(r.source_id_int));
        }

        return {
          id: r.id,
          kind: r.kind,
          side: r.side,
          status: r.status,
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
                amount: getNetAmount(r.currency_price ?? r.price, _.min([r.fee_bps, 10000])),
                nativeAmount: getNetAmount(r.price, _.min([r.fee_bps, 10000])),
              },
            },
            r.currency
              ? fromBuffer(r.currency)
              : r.side === "sell"
              ? Sdk.Common.Addresses.Eth[config.chainId]
              : Sdk.Common.Addresses.Weth[config.chainId]
          ),
          normalizedPrice: await getJoiPriceObject(
            {
              gross: {
                amount: r.currency_normalized_value ?? r.price,
                nativeAmount: r.normalized_value ?? r.price,
              },
              net: {
                amount: getNetAmount(r.currency_price ?? r.price, _.min([r.fee_bps, 10000])),
                nativeAmount: getNetAmount(r.price, _.min([r.fee_bps, 10000])),
              },
            },
            r.currency
              ? fromBuffer(r.currency)
              : r.side === "sell"
              ? Sdk.Common.Addresses.Eth[config.chainId]
              : Sdk.Common.Addresses.Weth[config.chainId]
          ),
          validFrom: Number(r.valid_from),
          validUntil: Number(r.valid_until),
          quantityFilled: Number(r.quantity_filled),
          quantityRemaining: Number(r.quantity_remaining),
          source: {
            id: source?.address,
            domain: source?.domain,
            name: source?.getTitle(),
            icon: source?.getIcon(),
            url: source?.metadata.url,
          },
          feeBps: String(r.fee_bps),
          feeBreakdown: r.fee_breakdown,
          missingRoyalties: r.missing_royalties,
          expiration: Number(r.expiration),
          isReservoir: r.is_reservoir,
          isDynamic: Boolean(r.dynamic || r.kind === "sudoswap"),
          createdAt: new Date(r.created_at * 1000).toISOString(),
          updatedAt: new Date(r.updated_at * 1000).toISOString(),
          rawData: r.raw_data,
        };
      });

      return {
        orders: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-orders-asks-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
