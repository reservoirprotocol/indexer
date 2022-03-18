/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";

const version = "v1";

export const getTokensFloorAskV1Options: RouteOptions = {
  description: "Get updates any time the best price of a token changes",
  notes:
    "Every time the best price of a token changes (i.e. the 'floor ask'), an event is generated. This API is designed to be polled at high frequency, in order to keep an external system in sync with accurate prices for any token.\n\nThere are multiple event types, which describe what caused the change in price:\n\n- `new-order` > new listing at a lower price\n\n- `expiry` > the previous best listing expired\n\n- `sale` > the previous best listing was filled\n\n- `cancel` > the previous best listing was cancelled\n\n- `balance-change` > the best listing was invalidated due to no longer owning the NFT\n\n- `approval-change` > the best listing was invalidated due to revoked approval\n\n- `revalidation` > manual revalidation of orders (e.g. after a bug fixed) \n\n- `bootstrap` > initial loading of data, so that all tokens have a price associated\n\nSome considerations to keep in mind\n\n- Due to the complex nature of monitoring off-chain liquidity across multiple marketplaces, including dealing with block re-orgs, events should be considered 'relative' to the perspective of the indexer, ie _when they were discovered_, rather than _when they happened_. A more deterministic historical record of price changes is in development, but in the meantime, this method is sufficent for keeping an external system in sync with the best available prices.\n\n- Events are only generated if the best price changes. So if a new order or sale happens without changing the best price, no event is generated. This is more common with 1155 tokens, which have multiple owners and more depth. For this reason, if you need sales data, use the Sales API.",
  tags: ["api", "2. Aggregator"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}/),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}:[0-9]+$/)
        .description(
          "Filter to a particular token, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      startTimestamp: Joi.number()
        .default(0)
        .description(
          "Get events after a particular unix timestamp (inclusive)"
        ),
      endTimestamp: Joi.number()
        .default(9999999999)
        .description(
          "Get events before a particular unix timestamp (inclusive)"
        ),
      sortDirection: Joi.string().valid("asc", "desc").default("desc"),
      continuation: Joi.string().pattern(/^\d+(.\d+)?_\d+$/),
      limit: Joi.number().integer().min(1).max(1000).default(50),
    }).oxor("contract", "token"),
  },
  response: {
    schema: Joi.object({
      events: Joi.array().items(
        Joi.object({
          kind: Joi.string().valid(
            "new-order",
            "expiry",
            "sale",
            "cancel",
            "balance-change",
            "approval-change",
            "bootstrap",
            "revalidation"
          ),
          contract: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}/),
          tokenId: Joi.string().pattern(/^[0-9]+$/),
          orderId: Joi.string().allow(null),
          maker: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{40}/)
            .allow(null),
          price: Joi.number().unsafe().allow(null),
          previousPrice: Joi.number().unsafe().allow(null),
          txHash: Joi.string()
            .lowercase()
            .pattern(/^0x[a-f0-9]{64}/)
            .allow(null),
          txTimestamp: Joi.number().allow(null),
          createdAt: Joi.string(),
        })
      ),
      continuation: Joi.string()
        .pattern(/^\d+(.\d+)?_\d+$/)
        .allow(null),
    }).label(`getTokensFloorAsk${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-tokens-floor-ask-${version}-handler`,
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
          "e"."id",
          "e"."kind",
          "e"."contract",
          "e"."token_id",
          "e"."order_id",
          "e"."maker",
          "e"."price",
          "e"."previous_price",
          "e"."tx_hash",
          "e"."tx_timestamp",
          extract(epoch from "e"."created_at") AS "created_at"
        FROM "token_floor_sell_events" "e"
      `;

      // Filters
      const conditions: string[] = [
        `"e"."created_at" >= to_timestamp($/startTimestamp/)`,
        `"e"."created_at" <= to_timestamp($/endTimestamp/)`,
      ];
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`"e"."contract" = $/contract/`);
      }
      if (query.token) {
        const [contract, tokenId] = query.token.split(":");

        (query as any).contract = toBuffer(contract);
        (query as any).tokenId = tokenId;
        conditions.push(`"e"."contract" = $/contract/`);
        conditions.push(`"e"."token_id" = $/tokenId/`);
      }
      if (query.continuation) {
        const [createdAt, id] = query.continuation.split("_");
        (query as any).createdAt = createdAt;
        (query as any).id = id;

        conditions.push(
          `("e"."created_at", "e"."id") ${
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
          "e"."created_at" ${query.sortDirection},
          "e"."id" ${query.sortDirection}
      `;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await edb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation =
          rawResult[rawResult.length - 1].created_at +
          "_" +
          rawResult[rawResult.length - 1].id;
      }

      const result = rawResult.map((r) => ({
        kind: r.kind,
        contract: fromBuffer(r.contract),
        tokenId: r.token_id,
        orderId: r.order_id,
        maker: r.maker ? fromBuffer(r.maker) : null,
        price: r.price ? formatEth(r.price) : null,
        previousPrice: r.previous_price ? formatEth(r.previous_price) : null,
        txHash: r.tx_hash ? fromBuffer(r.tx_hash) : null,
        txTimestamp: r.tx_timestamp ? Number(r.tx_timestamp) : null,
        createdAt: new Date(r.created_at * 1000).toISOString(),
      }));

      return {
        events: result,
        continuation,
      };
    } catch (error) {
      logger.error(
        `get-orders-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
