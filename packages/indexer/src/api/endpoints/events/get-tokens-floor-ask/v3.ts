/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  buildContinuation,
  formatEth,
  fromBuffer,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { Sources } from "@/models/sources";
import { getJoiPriceObject, JoiPrice } from "@/common/joi";

const version = "v3";

export const getTokensFloorAskV3Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 1000,
  },
  description: "Token price changes",
  notes:
    "Every time the best price of a token changes (i.e. the 'floor ask'), an event is generated. This API is designed to be polled at high frequency, in order to keep an external system in sync with accurate prices for any token.\n\nThere are multiple event types, which describe what caused the change in price:\n\n- `new-order` > new listing at a lower price\n\n- `expiry` > the previous best listing expired\n\n- `sale` > the previous best listing was filled\n\n- `cancel` > the previous best listing was cancelled\n\n- `balance-change` > the best listing was invalidated due to no longer owning the NFT\n\n- `approval-change` > the best listing was invalidated due to revoked approval\n\n- `revalidation` > manual revalidation of orders (e.g. after a bug fixed)\n\n- `reprice` > price update for dynamic orders (e.g. dutch auctions)\n\n- `bootstrap` > initial loading of data, so that all tokens have a price associated\n\nSome considerations to keep in mind\n\n- Due to the complex nature of monitoring off-chain liquidity across multiple marketplaces, including dealing with block re-orgs, events should be considered 'relative' to the perspective of the indexer, ie _when they were discovered_, rather than _when they happened_. A more deterministic historical record of price changes is in development, but in the meantime, this method is sufficent for keeping an external system in sync with the best available prices.\n\n- Events are only generated if the best price changes. So if a new order or sale happens without changing the best price, no event is generated. This is more common with 1155 tokens, which have multiple owners and more depth. For this reason, if you need sales data, use the Sales API.",
  tags: ["api", "Events"],
  plugins: {
    "hapi-swagger": {
      order: 4,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.string().lowercase().pattern(regex.address),
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Filter to a particular token, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      startTimestamp: Joi.number().description(
        "Get events after a particular unix timestamp (inclusive)"
      ),
      endTimestamp: Joi.number().description(
        "Get events before a particular unix timestamp (inclusive)"
      ),
      sortDirection: Joi.string().valid("asc", "desc").default("desc"),
      normalizeRoyalties: Joi.boolean()
        .default(false)
        .description("If true, prices will include missing royalties to be added on-top."),
      continuation: Joi.string().pattern(regex.base64),
      limit: Joi.number().integer().min(1).max(1000).default(50),
    }).oxor("contract", "token"),
  },
  response: {
    schema: Joi.object({
      events: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string().lowercase().pattern(regex.address),
            tokenId: Joi.string().pattern(regex.number),
          }),
          floorAsk: Joi.object({
            orderId: Joi.string().allow(null),
            maker: Joi.string().lowercase().pattern(regex.address).allow(null),
            nonce: Joi.string().pattern(regex.number).allow(null),
            price: JoiPrice.allow(null),
            validFrom: Joi.number().unsafe().allow(null),
            validUntil: Joi.number().unsafe().allow(null),
            source: Joi.string().allow("", null),
            isDynamic: Joi.boolean(),
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
    }).label(`getTokensFloorAsk${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-tokens-floor-ask-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          events.source_id_int,
          date_part('epoch', lower(events.valid_between)) AS valid_from,
          coalesce(
            nullif(date_part('epoch', upper(events.valid_between)), 'Infinity'),
            0
          ) AS valid_until,
          events.nonce,
          events.id,
          events.kind,
          events.contract,
          events.token_id,
          events.order_id,
          events.maker,
          events.price,
          events.previous_price,
          events.tx_hash,
          events.tx_timestamp,
          orders.currency,
          orders.dynamic,
          TRUNC(orders.currency_price, 0) AS currency_price,
          extract(epoch from events.created_at) AS created_at
        FROM ${
          query.normalizeRoyalties
            ? "token_normalized_floor_sell_events"
            : "token_floor_sell_events"
        } events
        LEFT JOIN LATERAL (
           SELECT currency, ${
             query.normalizeRoyalties ? "currency_normalized_value" : "currency_price"
           } AS "currency_price", dynamic
           FROM orders
           WHERE orders.id = events.order_id
        ) orders ON TRUE
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
        `events.created_at >= to_timestamp($/startTimestamp/)`,
        `events.created_at <= to_timestamp($/endTimestamp/)`,
        // Fix for the issue with negative prices for dutch auction orders
        // (eg. due to orders not properly expired on time)
        `coalesce(events.price, 0) >= 0`,
      ];
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`events.contract = $/contract/`);
      }
      if (query.token) {
        const [contract, tokenId] = query.token.split(":");

        (query as any).contract = toBuffer(contract);
        (query as any).tokenId = tokenId;
        conditions.push(`events.contract = $/contract/`);
        conditions.push(`events.token_id = $/tokenId/`);
      }
      if (query.continuation) {
        const [createdAt, id] = splitContinuation(query.continuation, /^\d+(.\d+)?_\d+$/);
        (query as any).createdAt = createdAt;
        (query as any).id = id;

        conditions.push(
          `(events.created_at, events.id) ${
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
          events.created_at ${query.sortDirection},
          events.id ${query.sortDirection}
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
          token: {
            contract: fromBuffer(r.contract),
            tokenId: r.token_id,
          },
          floorAsk: {
            orderId: r.order_id,
            maker: r.maker ? fromBuffer(r.maker) : null,
            nonce: r.nonce,
            price: r.price
              ? await getJoiPriceObject(
                  {
                    gross: {
                      amount: r.currency_price ?? r.price,
                      nativeAmount: r.price,
                    },
                  },
                  fromBuffer(r.currency)
                )
              : null,
            validFrom: r.price ? Number(r.valid_from) : null,
            validUntil: r.price ? Number(r.valid_until) : null,
            source: sources.get(r.source_id_int)?.name,
            isDynamic: Boolean(r.dynamic),
          },
          event: {
            id: r.id,
            previousPrice: r.previous_price ? formatEth(r.previous_price) : null,
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
      logger.error(`get-tokens-floor-ask-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
