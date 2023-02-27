/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiOrderCriteria, JoiPrice, getJoiPriceObject } from "@/common/joi";
import { buildContinuation, fromBuffer, regex, splitContinuation, toBuffer } from "@/common/utils";
import { Sources } from "@/models/sources";
import { Orders } from "@/utils/orders";

const version = "v3";

export const getAsksEventsV3Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 5000,
  },
  description: "Asks status changes",
  notes: "Get updates any time an asks status changes",
  tags: ["api", "Events"],
  plugins: {
    "hapi-swagger": {
      order: 4,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      startTimestamp: Joi.number().description(
        "Get events after a particular unix timestamp (inclusive)"
      ),
      endTimestamp: Joi.number().description(
        "Get events before a particular unix timestamp (inclusive)"
      ),
      includeCriteriaMetadata: Joi.boolean()
        .default(false)
        .description("If true, criteria metadata is included in the response."),
      sortDirection: Joi.string()
        .valid("asc", "desc")
        .default("desc")
        .description("Order the items are returned in the response."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(50)
        .description("Amount of items returned in response."),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
    }).oxor("contract"),
  },
  response: {
    schema: Joi.object({
      events: Joi.array().items(
        Joi.object({
          order: Joi.object({
            id: Joi.string(),
            status: Joi.string(),
            contract: Joi.string().lowercase().pattern(regex.address),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            price: JoiPrice.allow(null),
            quantityRemaining: Joi.number().unsafe(),
            nonce: Joi.string().pattern(regex.number).allow(null),
            validFrom: Joi.number().unsafe().allow(null),
            validUntil: Joi.number().unsafe().allow(null),
            rawData: Joi.object(),
            kind: Joi.string(),
            source: Joi.string().allow("", null),
            isDynamic: Joi.boolean(),
            criteria: JoiOrderCriteria.allow(null),
          }),
          event: Joi.object({
            id: Joi.number().unsafe(),
            kind: Joi.string().valid(
              "new-order",
              "expiry",
              "sale",
              "cancel",
              "balance-change",
              "approval-change",
              "bootstrap",
              "revalidation",
              "reprice"
            ),
            txHash: Joi.string().lowercase().pattern(regex.bytes32).allow(null),
            txTimestamp: Joi.number().allow(null),
            createdAt: Joi.string(),
          }),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getAsksEvents${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-asks-events-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      // We default in the code so that these values don't appear in the docs
      if (!query.startTimestamp) {
        query.startTimestamp = 0;
      }
      if (!query.endTimestamp) {
        query.endTimestamp = 9999999999;
      }

      // TODO: Backfill order fields in the ask events
      const joinWithOrders = query.startTimestamp < 1677484338;
      const t = joinWithOrders ? "orders" : "order_events";

      const criteriaBuildQuery = Orders.buildCriteriaQuery(
        t,
        "order_token_set_id",
        query.includeCriteriaMetadata
      );

      let baseQuery = `
        SELECT
          order_events.id,
          order_events.kind,
          order_events.status,
          order_events.contract,
          order_events.token_id,
          order_events.order_id,
          order_events.order_quantity_remaining,
          order_events.order_nonce,
          order_events.maker,
          order_events.price,
          order_events.order_source_id_int,
          coalesce(
            nullif(date_part('epoch', upper(order_events.order_valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          date_part('epoch', lower(order_events.order_valid_between)) AS valid_from,
          order_events.tx_hash,
          order_events.tx_timestamp,
          extract(epoch from order_events.created_at) AS created_at,
          ${t}.order_currency,
          ${t}.order_dynamic,
          ${t}.order_currency_normalized_value,
          ${t}.order_normalized_value,
          ${t}.order_kind,
          ${t}.order_token_set_id,
          trunc(${t}.order_currency_price, 0) AS order_currency_price,
          (
            CASE
              WHEN order_events.kind IN ('new-order', 'reprice') THEN ${t}.order_raw_data
              ELSE NULL
            END
          ) AS order_raw_data,
          (${criteriaBuildQuery}) AS criteria
        FROM order_events
        ${
          joinWithOrders
            ? `LEFT JOIN LATERAL (
                SELECT
                  orders.currency AS order_currency,
                  orders.currency_price AS order_currency_price,
                  orders.normalized_value AS order_normalized_value,
                  orders.currency_normalized_value AS order_currency_normalized_value,
                  orders.token_set_id AS order_token_set_id,
                  orders.dynamic AS order_dynamic,
                  orders.kind AS order_kind,
                  orders.raw_data AS order_raw_data
                FROM orders
                WHERE orders.id = order_events.order_id
              ) orders ON TRUE`
            : ""
        }
      `;

      // Filters
      const conditions: string[] = [
        `order_events.created_at >= to_timestamp($/startTimestamp/)`,
        `order_events.created_at <= to_timestamp($/endTimestamp/)`,
        // Fix for the issue with negative prices for dutch auction orders
        // (eg. due to orders not properly expired on time)
        `coalesce(order_events.price, 0) >= 0`,
      ];
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`order_events.contract = $/contract/`);
      }
      if (query.continuation) {
        const [createdAt, id] = splitContinuation(query.continuation, /^\d+(.\d+)?_\d+$/);
        (query as any).createdAt = createdAt;
        (query as any).id = id;

        conditions.push(
          `(order_events.created_at, order_events.id) ${
            query.sortDirection === "asc" ? ">" : "<"
          } (to_timestamp($/createdAt/), $/id/)`
        );
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += `
        ORDER BY
          order_events.created_at ${query.sortDirection},
          order_events.id ${query.sortDirection}
      `;

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
      const result = await Promise.all(
        rawResult.map(async (r) => ({
          order: {
            id: r.order_id,
            status: r.status,
            contract: fromBuffer(r.contract),
            maker: r.maker ? fromBuffer(r.maker) : null,
            price: r.price
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: query.normalizeRoyalties
                        ? r.order_currency_normalized_value ?? r.price
                        : r.order_currency_price ?? r.price,
                      nativeAmount: query.normalizeRoyalties
                        ? r.order_normalized_value ?? r.price
                        : r.price,
                    },
                  },
                  fromBuffer(r.order_currency)
                )
              : null,
            quantityRemaining: Number(r.order_quantity_remaining),
            nonce: r.order_nonce ?? null,
            validFrom: r.valid_from ? Number(r.valid_from) : null,
            validUntil: r.valid_until ? Number(r.valid_until) : null,
            rawData: r.order_raw_data ? r.order_raw_data : undefined,
            kind: r.order_kind,
            source: sources.get(r.order_source_id_int)?.name,
            isDynamic: Boolean(r.order_dynamic),
            criteria: r.criteria,
          },
          event: {
            id: r.id,
            kind: r.kind,
            txHash: r.tx_hash ? fromBuffer(r.tx_hash) : null,
            txTimestamp: r.tx_timestamp ? Number(r.tx_timestamp) : null,
            createdAt: new Date(r.created_at * 1000).toISOString(),
          },
        }))
      );

      return {
        events: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-asks-events-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
