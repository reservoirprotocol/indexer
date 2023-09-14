/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { buildContinuation, formatEth, fromBuffer, regex, splitContinuation } from "@/common/utils";
import { Sources } from "@/models/sources";

const version = "v1";

export const getCollectionsTopBidV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 1000,
  },
  description: "Collection top bid changes",
  notes:
    "Every time the top offer of a collection changes (i.e. the 'top bid'), an event is generated. This API is designed to be polled at high frequency.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 4,
    },
  },
  validate: {
    query: Joi.object({
      collection: Joi.string().description(
        "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
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
    }).oxor("collection"),
  },
  response: {
    schema: Joi.object({
      events: Joi.array().items(
        Joi.object({
          collection: Joi.object({
            id: Joi.string(),
          }),
          topBid: Joi.object({
            orderId: Joi.string().allow(null),
            contract: Joi.string().lowercase().pattern(regex.address).allow(null),
            tokenSetId: Joi.string().allow(null),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            price: Joi.number().unsafe().allow(null),
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
            previousPrice: Joi.number().unsafe().allow(null),
            txHash: Joi.string().lowercase().pattern(regex.bytes32).allow(null),
            txTimestamp: Joi.number().allow(null),
            createdAt: Joi.string(),
          }),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getCollectionsTopbid${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-collections-top-bid-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          coalesce(
            nullif(date_part('epoch', upper(collection_top_bid_events.order_valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          collection_top_bid_events.id,
          collection_top_bid_events.kind,
          collection_top_bid_events.collection_id,
          collection_top_bid_events.contract,
          collection_top_bid_events.token_set_id,
          collection_top_bid_events.order_id,
          collection_top_bid_events.order_source_id_int,
          collection_top_bid_events.maker,
          collection_top_bid_events.price,
          collection_top_bid_events.previous_price,
          collection_top_bid_events.tx_hash,
          collection_top_bid_events.tx_timestamp,
          extract(epoch from collection_top_bid_events.created_at) AS created_at
        FROM collection_top_bid_events
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
        `collection_top_bid_events.created_at >= to_timestamp($/startTimestamp/)`,
        `collection_top_bid_events.created_at <= to_timestamp($/endTimestamp/)`,
      ];
      if (query.collection) {
        conditions.push(`collection_top_bid_events.collection_id = $/collection/`);
      }
      if (query.continuation) {
        const [createdAt, id] = splitContinuation(query.continuation, /^\d+(.\d+)?_\d+$/);
        (query as any).createdAt = createdAt;
        (query as any).id = id;

        conditions.push(
          `(collection_top_bid_events.created_at, collection_top_bid_events.id) ${
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
          collection_top_bid_events.created_at ${query.sortDirection},
          collection_top_bid_events.id ${query.sortDirection}
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
        collection: {
          id: r.collection_id,
        },
        topBid: {
          orderId: r.order_id,
          contract: r.contract ? fromBuffer(r.contract) : null,
          tokenSetId: r.token_set_id,
          maker: r.maker ? fromBuffer(r.maker) : null,
          price: r.price ? formatEth(r.price) : null,
          validUntil: r.price ? Number(r.valid_until) : null,
          source: sources.get(r.order_source_id_int)?.name,
        },
        event: {
          id: r.id,
          previousPrice: r.previous_price ? formatEth(r.previous_price) : null,
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
      logger.error(`get-collections-top-bid-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
