/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiPrice, getJoiPriceObject, JoiOrderCriteria } from "@/common/joi";
import {
  buildContinuation,
  fromBuffer,
  getNetAmount,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { Orders } from "@/utils/orders";

const version = "v4";

export const getOrdersAsksV4Options: RouteOptions = {
  description: "Asks (listings)",
  notes:
    "Get a list of asks (listings), filtered by token, collection or maker. This API is designed for efficiently ingesting large volumes of orders, for external processing",
  tags: ["api", "Orders"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      ids: Joi.alternatives(Joi.array().items(Joi.string()), Joi.string()).description(
        "Order id(s) to search for."
      ),
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      maker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Filter to a particular user. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      community: Joi.string()
        .lowercase()
        .description("Filter to a particular community. Example: `artblocks`"),
      contracts: Joi.alternatives()
        .try(
          Joi.array().max(50).items(Joi.string().lowercase().pattern(regex.address)),
          Joi.string().lowercase().pattern(regex.address)
        )
        .description(
          "Filter to an array of contracts. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      status: Joi.string()
        .when("maker", {
          is: Joi.exist(),
          then: Joi.valid("active", "inactive", "expired", "cancelled", "filled"),
          otherwise: Joi.valid("active"),
        })
        .when("contracts", {
          is: Joi.exist(),
          then: Joi.valid("active", "any"),
          otherwise: Joi.valid("active"),
        })
        .description(
          "active = currently valid\ninactive = temporarily invalid\nexpired, cancelled, filled = permanently invalid\nany = any status\nAvailable when filtering by maker, otherwise only valid orders will be returned"
        ),
      source: Joi.string()
        .pattern(regex.domain)
        .description("Filter to a source by domain. Example: `opensea.io`"),
      native: Joi.boolean().description("If true, results will filter only Reservoir orders."),
      includePrivate: Joi.boolean()
        .default(false)
        .description("If true, private orders are included in the response."),
      includeCriteriaMetadata: Joi.boolean()
        .default(false)
        .description("If true, criteria metadata is included in the response."),
      includeRawData: Joi.boolean()
        .default(false)
        .description("If true, raw data is included in the response."),
      startTimestamp: Joi.number().description(
        "Get events after a particular unix timestamp (inclusive)"
      ),
      endTimestamp: Joi.number().description(
        "Get events before a particular unix timestamp (inclusive)"
      ),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      sortBy: Joi.string()
        .valid("createdAt", "price")
        .default("createdAt")
        .description(
          "Order the items are returned in the response, Sorting by price allowed only when filtering by token"
        ),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(50)
        .description("Amount of items returned in response."),
    }).with("community", "maker"),
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
          quantityFilled: Joi.number().unsafe(),
          quantityRemaining: Joi.number().unsafe(),
          criteria: JoiOrderCriteria.allow(null),
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
          expiration: Joi.number().required(),
          isReservoir: Joi.boolean().allow(null),
          isDynamic: Joi.boolean(),
          createdAt: Joi.string().required(),
          updatedAt: Joi.string().required(),
          rawData: Joi.object().optional().allow(null),
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
      const criteriaBuildQuery = Orders.buildCriteriaQuery(
        "orders",
        "token_set_id",
        query.includeCriteriaMetadata
      );

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
          dynamic,
          DATE_PART('epoch', LOWER(orders.valid_between)) AS valid_from,
          COALESCE(
            NULLIF(DATE_PART('epoch', UPPER(orders.valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          orders.source_id_int,
          orders.quantity_filled,
          orders.quantity_remaining,
          orders.fee_bps,
          orders.fee_breakdown,
          COALESCE(
            NULLIF(DATE_PART('epoch', orders.expiration), 'Infinity'),
            0
          ) AS expiration,
          orders.is_reservoir,
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
          orders.updated_at,
          (${criteriaBuildQuery}) AS criteria
          ${query.includeRawData ? ", orders.raw_data" : ""}
        FROM orders
      `;

      // We default in the code so that these values don't appear in the docs
      if (query.startTimestamp || query.endTimestamp) {
        if (!query.startTimestamp) {
          query.startTimestamp = 0;
        }
        if (!query.endTimestamp) {
          query.endTimestamp = 9999999999;
        }
      }

      // Filters
      const conditions: string[] =
        query.startTimestamp || query.endTimestamp
          ? [
              `orders.created_at >= to_timestamp($/startTimestamp/)`,
              `orders.created_at <= to_timestamp($/endTimestamp/)`,
              `orders.side = 'sell'`,
            ]
          : [`orders.side = 'sell'`];

      let communityFilter = "";
      let orderStatusFilter = "";

      if (query.ids) {
        if (Array.isArray(query.ids)) {
          conditions.push(`orders.id IN ($/ids:csv/)`);
        } else {
          conditions.push(`orders.id = $/ids/`);
        }
      } else {
        orderStatusFilter = `orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'`;
      }

      if (query.token) {
        (query as any).tokenSetId = `token:${query.token}`;
        conditions.push(`orders.token_set_id = $/tokenSetId/`);
      }

      if (query.contracts) {
        if (!_.isArray(query.contracts)) {
          query.contracts = [query.contracts];
        }

        (query as any).contractsFilter = query.contracts.map(toBuffer);
        conditions.push(`orders.contract IN ($/contractsFilter:list/)`);

        if (query.status === "any") {
          orderStatusFilter = "";
        }
      }

      if (query.maker) {
        switch (query.status) {
          case "inactive": {
            // Potentially-valid orders
            orderStatusFilter = `orders.fillability_status = 'no-balance' OR (orders.fillability_status = 'fillable' AND orders.approval_status != 'approved')`;
            break;
          }
          case "expired": {
            orderStatusFilter = `orders.fillability_status = 'expired'`;
            break;
          }
          case "filled": {
            orderStatusFilter = `orders.fillability_status = 'filled'`;
            break;
          }
          case "cancelled": {
            orderStatusFilter = `orders.fillability_status = 'cancelled'`;
            break;
          }
        }

        (query as any).maker = toBuffer(query.maker);
        conditions.push(`orders.maker = $/maker/`);

        // Community filter is valid only when maker filter is passed
        if (query.community) {
          communityFilter =
            "JOIN (SELECT DISTINCT contract FROM collections WHERE community = $/community/) c ON orders.contract = c.contract";
        }
      }

      if (query.source) {
        const sources = await Sources.getInstance();
        const source = sources.getByDomain(query.source);

        if (!source) {
          return { orders: [] };
        }

        (query as any).source = source.id;
        conditions.push(`orders.source_id_int = $/source/`);
      }

      if (query.native) {
        conditions.push(`orders.is_reservoir`);
      }

      if (!query.includePrivate) {
        conditions.push(
          `orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL`
        );
      }

      if (orderStatusFilter) {
        conditions.push(orderStatusFilter);
      }

      if (query.continuation) {
        const [priceOrCreatedAt, id] = splitContinuation(
          query.continuation,
          /^\d+(.\d+)?_0x[a-f0-9]{64}$/
        );
        (query as any).priceOrCreatedAt = priceOrCreatedAt;
        (query as any).id = id;

        if (query.sortBy === "price") {
          if (query.normalizeRoyalties) {
            conditions.push(`(orders.normalized_value, orders.id) > ($/priceOrCreatedAt/, $/id/)`);
          } else {
            conditions.push(`(orders.price, orders.id) > ($/priceOrCreatedAt/, $/id/)`);
          }
        } else {
          conditions.push(
            `(orders.created_at, orders.id) < (to_timestamp($/priceOrCreatedAt/), $/id/)`
          );
        }
      }

      baseQuery += communityFilter;

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      if (query.sortBy === "price") {
        if (query.normalizeRoyalties) {
          baseQuery += ` ORDER BY orders.normalized_value, orders.id`;
        } else {
          baseQuery += ` ORDER BY orders.price, orders.id`;
        }
      } else {
        baseQuery += ` ORDER BY orders.created_at DESC, orders.id DESC`;
      }

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        if (query.sortBy === "price") {
          if (query.normalizeRoyalties) {
            continuation = buildContinuation(
              rawResult[rawResult.length - 1].normalized_value ??
                rawResult[rawResult.length - 1].price + "_" + rawResult[rawResult.length - 1].id
            );
          } else {
            continuation = buildContinuation(
              rawResult[rawResult.length - 1].price + "_" + rawResult[rawResult.length - 1].id
            );
          }
        } else {
          continuation = buildContinuation(
            rawResult[rawResult.length - 1].created_at + "_" + rawResult[rawResult.length - 1].id
          );
        }
      }

      const sources = await Sources.getInstance();
      const result = rawResult.map(async (r) => {
        const feeBreakdown = r.fee_breakdown;
        let feeBps = r.fee_bps;

        if (query.normalizeRoyalties && r.missing_royalties) {
          for (let i = 0; i < r.missing_royalties.length; i++) {
            const index: number = r.fee_breakdown.findIndex(
              (fee: { recipient: string }) => fee.recipient === r.missing_royalties[i].recipient
            );

            const missingFeeBps = Number(r.missing_royalties[i].bps);
            feeBps += missingFeeBps;

            if (index !== -1) {
              feeBreakdown[index].bps += missingFeeBps;
            } else {
              feeBreakdown.push({
                bps: missingFeeBps,
                kind: "royalty",
                recipient: r.missing_royalties[i].recipient,
              });
            }
          }
        }

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
                amount: query.normalizeRoyalties
                  ? r.currency_normalized_value ?? r.price
                  : r.currency_price ?? r.price,
                nativeAmount: query.normalizeRoyalties ? r.normalized_value ?? r.price : r.price,
              },
              net: {
                amount: getNetAmount(r.currency_price ?? r.price, r.fee_bps),
                nativeAmount: getNetAmount(r.price, r.fee_bps),
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
          criteria: r.criteria,
          source: {
            id: source?.address,
            domain: source?.domain,
            name: source?.getTitle(),
            icon: source?.getIcon(),
            url: source?.metadata.url,
          },
          feeBps: Number(feeBps.toString()),
          feeBreakdown: feeBreakdown,
          expiration: Number(r.expiration),
          isReservoir: r.is_reservoir,
          isDynamic: Boolean(r.dynamic),
          createdAt: new Date(r.created_at * 1000).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
          rawData: query.includeRawData ? r.raw_data : undefined,
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
