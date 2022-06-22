/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  base64Regex,
  buildContinuation,
  formatEth,
  fromBuffer,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { Sources } from "@/models/sources";
import crypto from "crypto";

const version = "v3";

export const getSalesV3Options: RouteOptions = {
  description: "Historical sales",
  notes:
    "Get recent sales for a contract or token. Note: this API is returns rich metadata, and has advanced filters, so is only designed for small amounts of recent sales. If you want access to sales in bulk, use the `Aggregator > Bulk Sales` API.",
  tags: ["api", "Sales"],
  plugins: {
    "hapi-swagger": {
      order: 8,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description(
          "Filter to a particular contract, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Filter to a particular token, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      attributes: Joi.object()
        .unknown()
        .description("Filter to a particular attribute, e.g. `attributes[Type]=Original`"),
      startTimestamp: Joi.number().description(
        "Get events after a particular unix timestamp (inclusive)"
      ),
      endTimestamp: Joi.number().description(
        "Get events before a particular unix timestamp (inclusive)"
      ),
      limit: Joi.number().integer().min(1).max(100).default(20),
      continuation: Joi.string().pattern(base64Regex),
    })
      .oxor("contract", "token", "collection")
      .with("attributes", "collection"),
  },
  response: {
    schema: Joi.object({
      sales: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          token: Joi.object({
            contract: Joi.string()
              .lowercase()
              .pattern(/^0x[a-fA-F0-9]{40}$/),
            tokenId: Joi.string().pattern(/^[0-9]+$/),
            name: Joi.string().allow(null, ""),
            image: Joi.string().allow(null, ""),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow(null, ""),
            }),
          }),
          orderSource: Joi.string().allow(null, ""),
          orderSide: Joi.string().valid("ask", "bid"),
          from: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/),
          to: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{40}$/),
          amount: Joi.string(),
          fillSource: Joi.string().allow(null),
          txHash: Joi.string()
            .lowercase()
            .pattern(/^0x[a-fA-F0-9]{64}$/),
          logIndex: Joi.number(),
          batchIndex: Joi.number(),
          timestamp: Joi.number(),
          price: Joi.number().unsafe().allow(null),
        })
      ),
      continuation: Joi.string().pattern(base64Regex).allow(null),
    }).label(`getSales${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-sales-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    let paginationFilter = "";
    let tokenFilter = "";
    let tokenJoins = "";
    let collectionFilter = "";

    // Filters
    if (query.contract) {
      (query as any).contract = toBuffer(query.contract);
      tokenFilter = `fill_events_2.contract = $/contract/`;
    } else if (query.token) {
      const [contract, tokenId] = query.token.split(":");

      (query as any).contract = toBuffer(contract);
      (query as any).tokenId = tokenId;
      tokenFilter = `fill_events_2.contract = $/contract/ AND fill_events_2.token_id = $/tokenId/`;
    } else if (query.collection) {
      if (query.attributes) {
        const attributes: { key: string; value: string }[] = [];
        Object.entries(query.attributes).forEach(([key, values]) => {
          (Array.isArray(values) ? values : [values]).forEach((value) =>
            attributes.push({ key, value })
          );
        });

        for (let i = 0; i < attributes.length; i++) {
          (query as any)[`key${i}`] = attributes[i].key;
          (query as any)[`value${i}`] = attributes[i].value;
          tokenJoins += `
            JOIN token_attributes ta${i}
              ON fill_events_2.contract = ta${i}.contract
              AND fill_events_2.token_id = ta${i}.token_id
              AND ta${i}.key = $/key${i}/
              AND ta${i}.value = $/value${i}/
          `;
        }
      }

      if (query.collection.match(/^0x[a-f0-9]{40}:\d+:\d+$/g)) {
        const [contract, startTokenId, endTokenId] = query.collection.split(":");

        (query as any).contract = toBuffer(contract);
        (query as any).startTokenId = startTokenId;
        (query as any).endTokenId = endTokenId;
        collectionFilter = `
          fill_events_2.contract = $/contract/
          AND fill_events_2.token_id >= $/startTokenId/
          AND fill_events_2.token_id <= $/endTokenId/
        `;
      } else {
        (query as any).contract = toBuffer(query.collection);
        collectionFilter = `fill_events_2.contract = $/contract/`;
      }
    } else {
      collectionFilter = "TRUE";
    }

    if (query.continuation) {
      const [timestamp, logIndex, batchIndex] = splitContinuation(
        query.continuation,
        /^(\d+)_(\d+)_(\d+)$/
      );
      (query as any).timestamp = timestamp;
      (query as any).logIndex = logIndex;
      (query as any).batchIndex = batchIndex;

      paginationFilter = `
        AND (fill_events_2.timestamp, fill_events_2.log_index, fill_events_2.batch_index) < ($/timestamp/, $/logIndex/, $/batchIndex/)
      `;
    }

    // We default in the code so that these values don't appear in the docs
    if (!query.startTimestamp) {
      query.startTimestamp = 0;
    }
    if (!query.endTimestamp) {
      query.endTimestamp = 9999999999;
    }

    const timestampFilter = `
      AND (fill_events_2.timestamp >= $/startTimestamp/ AND
      fill_events_2.timestamp <= $/endTimestamp/)
    `;

    try {
      const baseQuery = `
        SELECT
          fill_events_2_data.*,
          tokens_data.name,
          tokens_data.image,
          tokens_data.collection_id,
          tokens_data.collection_name
        FROM (
          SELECT
            coalesce(
              orders.source_id,
              (CASE
                WHEN orders.kind = 'wyvern-v2' THEN '\\x5b3256965e7c3cf26e11fcaf296dfc8807c01073'::BYTEA
                WHEN orders.kind = 'wyvern-v2.3' THEN '\\x5b3256965e7c3cf26e11fcaf296dfc8807c01073'::BYTEA
                WHEN orders.kind = 'seaport' THEN '\\x5b3256965e7c3cf26e11fcaf296dfc8807c01073'::BYTEA
                WHEN orders.kind = 'looks-rare' THEN '\\x5924a28caaf1cc016617874a2f0c3710d881f3c1'::BYTEA
              END)
            ) AS source_id,
            fill_events_2.contract,
            fill_events_2.token_id,
            fill_events_2.order_side,
            fill_events_2.maker,
            fill_events_2.taker,
            fill_events_2.amount,
            fill_events_2.fill_source,
            fill_events_2.tx_hash,
            fill_events_2.timestamp,
            fill_events_2.price,
            fill_events_2.block,
            fill_events_2.log_index,
            fill_events_2.batch_index
          FROM fill_events_2
          LEFT JOIN orders
            ON fill_events_2.order_id = orders.id
            ${tokenJoins}
          WHERE
            ${collectionFilter}
            ${tokenFilter}
            ${paginationFilter}
            ${timestampFilter}
          ORDER BY
            fill_events_2.timestamp DESC,
            fill_events_2.log_index DESC,
            fill_events_2.batch_index DESC
          LIMIT $/limit/
        ) AS fill_events_2_data
        JOIN LATERAL (
          SELECT
            tokens.name,
            tokens.image,
            tokens.collection_id,
            collections.name AS collection_name
          FROM tokens
          LEFT JOIN collections 
            ON tokens.collection_id = collections.id
          WHERE fill_events_2_data.token_id = tokens.token_id
            AND fill_events_2_data.contract = tokens.contract
        ) tokens_data ON TRUE
      `;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        continuation = buildContinuation(
          rawResult[rawResult.length - 1].timestamp +
            "_" +
            rawResult[rawResult.length - 1].log_index +
            "_" +
            rawResult[rawResult.length - 1].batch_index
        );
      }

      const sources = await Sources.getInstance();
      const result = rawResult.map((r) => ({
        id: crypto
          .createHash("sha256")
          .update(`${fromBuffer(r.tx_hash)}${r.log_index}${r.batch_index}`)
          .digest("hex"),
        token: {
          contract: fromBuffer(r.contract),
          tokenId: r.token_id,
          name: r.name,
          image: r.image,
          collection: {
            id: r.collection_id,
            name: r.collection_name,
          },
        },
        orderSource: r.source_id ? sources.getByAddress(fromBuffer(r.source_id))?.name : null,
        orderSide: r.order_side === "sell" ? "ask" : "bid",
        from: r.order_side === "sell" ? fromBuffer(r.maker) : fromBuffer(r.taker),
        to: r.order_side === "sell" ? fromBuffer(r.taker) : fromBuffer(r.maker),
        amount: String(r.amount),
        fillSource: r.fill_source ? String(r.fill_source) : null,
        txHash: fromBuffer(r.tx_hash),
        logIndex: r.log_index,
        batchIndex: r.batch_index,
        timestamp: r.timestamp,
        price: r.price ? formatEth(r.price) : null,
      }));

      return {
        sales: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-sales-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
