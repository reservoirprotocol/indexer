/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiOrderCriteria, JoiPrice, getJoiPriceObject } from "@/common/joi";
import { buildContinuation, fromBuffer, regex, splitContinuation, toBuffer } from "@/common/utils";
import { Sources } from "@/models/sources";
import { Orders } from "@/utils/orders";
import * as Boom from "@hapi/boom";

const version = "v3";

export const getBidEventsV3Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 5000,
  },
  description: "Bid status changes",
  notes:
    "Every time a bid status changes, an event is generated. This API is designed to be polled at high frequency, in order to keep an external system in sync with accurate prices for any token.\n\nThere are multiple event types, which describe what caused the change in price:\n\n- `new-order` > new offer at a lower price\n\n- `expiry` > the previous best offer expired\n\n- `sale` > the previous best offer was filled\n\n- `cancel` > the previous best offer was canceled\n\n- `balance-change` > the best offer was invalidated due to no longer owning the NFT\n\n- `approval-change` > the best offer was invalidated due to revoked approval\n\n- `revalidation` > manual revalidation of orders (e.g. after a bug fixed)\n\n- `reprice` > price update for dynamic orders (e.g. dutch auctions)\n\n- `bootstrap` > initial loading of data, so that all tokens have a price associated\n\nSome considerations to keep in mind\n\n- Selling a partial quantity of available 1155 tokens in a listing will generate a `sale` and will have a new quantity.\n\n- Due to the complex nature of monitoring off-chain liquidity across multiple marketplaces, including dealing with block re-orgs, events should be considered 'relative' to the perspective of the indexer, ie _when they were discovered_, rather than _when they happened_. A more deterministic historical record of price changes is in development, but in the meantime, this method is sufficent for keeping an external system in sync with the best available prices.",
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
        .description("Amount of items returned in response. Max limit is 1000."),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Return result in given currency"),
    }).oxor("contract"),
  },
  response: {
    schema: Joi.object({
      events: Joi.array().items(
        Joi.object({
          bid: Joi.object({
            id: Joi.string().description("Order Id"),
            status: Joi.string().description(
              "Can return `active`,  inactive`, `expired`, `canceled`, or `filled`."
            ),
            contract: Joi.string().lowercase().pattern(regex.address),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            price: JoiPrice.allow(null),
            quantityRemaining: Joi.number()
              .unsafe()
              .description("With ERC1155s, quantity can be higher than 1"),
            nonce: Joi.string().pattern(regex.number).allow(null),
            validFrom: Joi.number().unsafe().allow(null),
            validUntil: Joi.number().unsafe().allow(null),
            rawData: Joi.object(),
            kind: Joi.string(),
            source: Joi.string().allow("", null),
            criteria: JoiOrderCriteria.allow(null).description(
              "`kind` can return `token`, `collection`, or `attribute`."
            ),
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
            txTimestamp: Joi.number().allow(null).description("Time when added on the blockchain."),
            createdAt: Joi.string().description("Time when added to indexer"),
          }),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getBidEvents${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-bid-events-${version}-handler`, `Wrong response schema: ${error}`);
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

      // TODO: Backfill order fields in the bid events
      const joinWithOrders = query.startTimestamp < 1677484338;
      const t = joinWithOrders ? "orders" : "bid_events";

      const criteriaBuildQuery = Orders.buildCriteriaQuery(
        "bid_events",
        "token_set_id",
        query.includeCriteriaMetadata
      );

      let baseQuery = `
        SELECT
          bid_events.id,
          bid_events.kind,
          bid_events.status,
          bid_events.contract,
          bid_events.token_set_id,
          bid_events.order_id,
          bid_events.order_quantity_remaining,
          bid_events.order_nonce,
          bid_events.maker,
          bid_events.price,
          bid_events.value,
          bid_events.order_source_id_int,
          coalesce(
            nullif(date_part('epoch', upper(bid_events.order_valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          date_part('epoch', lower(bid_events.order_valid_between)) AS valid_from,
          bid_events.tx_hash,
          bid_events.tx_timestamp,
          extract(epoch from bid_events.created_at) AS created_at,
          ${t}.order_currency,
          ${t}.order_normalized_value,
          ${t}.order_currency_normalized_value,
          ${t}.order_kind,
          trunc(${t}.order_currency_price, 0) AS order_currency_price,
          (
            CASE
              WHEN bid_events.kind IN ('new-order', 'reprice') THEN ${t}.order_raw_data
              ELSE NULL
            END
          ) AS order_raw_data,
          (${criteriaBuildQuery}) AS criteria
        FROM bid_events
        ${
          joinWithOrders
            ? `JOIN LATERAL (
                SELECT
                  orders.currency AS order_currency,
                  orders.currency_price AS order_currency_price,
                  orders.normalized_value AS order_normalized_value,
                  orders.currency_normalized_value AS order_currency_normalized_value,
                  orders.kind AS order_kind,
                  orders.raw_data AS order_raw_data
                FROM orders
                WHERE orders.id = bid_events.order_id
              ) orders ON TRUE`
            : ""
        }
      `;

      // Filters
      const conditions: string[] = [
        `bid_events.created_at >= to_timestamp($/startTimestamp/)`,
        `bid_events.created_at <= to_timestamp($/endTimestamp/)`,
      ];
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`bid_events.contract = $/contract/`);
      }
      if (query.continuation) {
        const [createdAt, id] = splitContinuation(query.continuation, /^\d+(.\d+)?_\d+$/);
        (query as any).createdAt = createdAt;
        (query as any).id = id;

        if (isNaN(Number(id))) {
          throw Boom.badRequest("Invalid continuation string used");
        }

        conditions.push(
          `(bid_events.created_at, bid_events.id) ${
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
          bid_events.created_at ${query.sortDirection},
          bid_events.id ${query.sortDirection}
      `;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await edb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation = buildContinuation(
          rawResult[rawResult.length - 1].created_at + "_" + rawResult[rawResult.length - 1].id
        );
      }

      const sources = await Sources.getInstance();
      const result = await Promise.all(
        rawResult.map(async (r) => ({
          bid: {
            id: r.order_id,
            status: r.status,
            contract: fromBuffer(r.contract),
            maker: r.maker ? fromBuffer(r.maker) : null,
            price: r.price
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: r.order_currency_price ?? r.price,
                      nativeAmount: r.price,
                    },
                    net: {
                      amount: query.normalizeRoyalties
                        ? r.order_currency_normalized_value ?? r.value
                        : r.order_currency_value ?? r.value,
                      nativeAmount: query.normalizeRoyalties
                        ? r.order_normalized_value ?? r.value
                        : r.value,
                    },
                  },
                  fromBuffer(r.order_currency),
                  query.displayCurrency
                )
              : null,
            quantityRemaining: Number(r.order_quantity_remaining),
            nonce: r.order_nonce ?? null,
            validFrom: r.valid_from ? Number(r.valid_from) : null,
            validUntil: r.valid_until ? Number(r.valid_until) : null,
            rawData: r.order_raw_data ? r.order_raw_data : undefined,
            kind: r.order_kind,
            source: sources.get(r.order_source_id_int)?.name,
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
      logger.error(`get-bid-events-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
