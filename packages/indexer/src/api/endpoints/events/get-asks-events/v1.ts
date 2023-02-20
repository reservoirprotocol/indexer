/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  buildContinuation,
  formatEth,
  fromBuffer,
  splitContinuation,
  regex,
  toBuffer,
} from "@/common/utils";
import { Sources } from "@/models/sources";

const version = "v1";

export const getOrderEventsV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 5000,
  },
  description: "Order status changes",
  notes: "Get updates any time an order status changes",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
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
            tokenId: Joi.string().pattern(regex.number),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            price: Joi.number().unsafe().allow(null),
            quantityRemaining: Joi.number().unsafe(),
            nonce: Joi.string().pattern(regex.number).allow(null),
            validFrom: Joi.number().unsafe().allow(null),
            validUntil: Joi.number().unsafe().allow(null),
            source: Joi.string().allow("", null),
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
    }).label(`getOrderEvents${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-order-events-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
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
          extract(epoch from order_events.created_at) AS created_at
        FROM order_events
      `;

      // We default in the code so that these values don't appear in the docs
      if (!query.startTimestamp) {
        query.startTimestamp = 0;
      }
      if (!query.endTimestamp) {
        query.endTimestamp = 9999999999;
      }

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
      const result = rawResult.map((r) => ({
        order: {
          id: r.order_id,
          status: r.status,
          contract: fromBuffer(r.contract),
          tokenId: r.token_id,
          maker: r.maker ? fromBuffer(r.maker) : null,
          price: r.price ? formatEth(r.price) : null,
          quantityRemaining: Number(r.order_quantity_remaining),
          nonce: r.order_nonce ?? null,
          validFrom: r.valid_from ? Number(r.valid_from) : null,
          validUntil: r.valid_until ? Number(r.valid_until) : null,
          source: sources.get(r.order_source_id_int)?.name,
        },
        event: {
          id: r.id,
          kind: r.kind,
          txHash: r.tx_hash ? fromBuffer(r.tx_hash) : null,
          txTimestamp: r.tx_timestamp ? Number(r.tx_timestamp) : null,
          createdAt: new Date(r.created_at * 1000).toISOString(),
        },
      }));

      return {
        events: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-order-events-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
