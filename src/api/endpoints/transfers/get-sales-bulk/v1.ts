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

const version = "v1";

export const getSalesBulkV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 5000,
  },
  description: "Bulk historical sales",
  notes:
    "Note: this API is optimized for bulk access, and offers minimal filters/metadata. If you need more flexibility, try the `NFT API > Sales` endpoint",
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
          "Filter to a particular contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      startTimestamp: Joi.number().description(
        "Get events after a particular unix timestamp (inclusive)"
      ),
      endTimestamp: Joi.number().description(
        "Get events before a particular unix timestamp (inclusive)"
      ),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(100)
        .description("Amount of items returned in response."),
      continuation: Joi.string()
        .pattern(base64Regex)
        .description("Use continuation token to request next offset of items."),
    }),
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
          }),
          orderSource: Joi.string().allow(null, ""),
          orderSide: Joi.string().valid("ask", "bid"),
          orderKind: Joi.string(),
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
    }).label(`getSalesBulk${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-sales-bulk-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    // Filters
    const conditions: string[] = [];
    if (query.contract) {
      (query as any).contract = toBuffer(query.contract);
      conditions.push(`fill_events_2.contract = $/contract/`);
    }

    if (query.token) {
      const [contract, tokenId] = query.token.split(":");

      (query as any).contract = toBuffer(contract);
      (query as any).tokenId = tokenId;
      conditions.push(
        `fill_events_2.contract = $/contract/ AND fill_events_2.token_id = $/tokenId/`
      );
    }

    if (query.continuation) {
      const [timestamp, logIndex, batchIndex] = splitContinuation(
        query.continuation,
        /^(\d+)_(\d+)_(\d+)$/
      );
      (query as any).timestamp = timestamp;
      (query as any).logIndex = logIndex;
      (query as any).batchIndex = batchIndex;

      conditions.push(`
        (fill_events_2.timestamp, fill_events_2.log_index, fill_events_2.batch_index) < ($/timestamp/, $/logIndex/, $/batchIndex/)
      `);
    }

    // We default in the code so that these values don't appear in the docs
    if (!query.startTimestamp) {
      query.startTimestamp = 0;
    }
    if (!query.endTimestamp) {
      query.endTimestamp = 9999999999;
    }

    conditions.push(`
      (fill_events_2.timestamp >= $/startTimestamp/ AND
      fill_events_2.timestamp <= $/endTimestamp/)
    `);

    let conditionsRendered = "";
    if (conditions.length) {
      conditionsRendered = "WHERE " + conditions.join(" AND ");
    }

    try {
      const baseQuery = `
        SELECT
          fill_events_2_data.*
        FROM (
          SELECT
            fill_events_2.contract,
            fill_events_2.token_id,
            fill_events_2.order_side,
            fill_events_2.order_kind,
            fill_events_2.order_source_id_int,
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
          ${conditionsRendered}            
          ORDER BY
            fill_events_2.timestamp DESC,
            fill_events_2.log_index DESC,
            fill_events_2.batch_index DESC
          LIMIT $/limit/
        ) AS fill_events_2_data
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
      const result = rawResult.map((r) => {
        const orderSource = r.order_source_id_int ? sources.get(r.order_source_id_int)?.name : null;

        return {
          id: crypto
            .createHash("sha256")
            .update(`${fromBuffer(r.tx_hash)}${r.log_index}${r.batch_index}`)
            .digest("hex"),
          token: {
            contract: fromBuffer(r.contract),
            tokenId: r.token_id,
          },
          orderSource,
          orderSide: r.order_side === "sell" ? "ask" : "bid",
          orderKind: r.order_kind,
          from: r.order_side === "sell" ? fromBuffer(r.maker) : fromBuffer(r.taker),
          to: r.order_side === "sell" ? fromBuffer(r.taker) : fromBuffer(r.maker),
          amount: String(r.amount),
          fillSource: r.fill_source ? String(r.fill_source) : orderSource,
          txHash: fromBuffer(r.tx_hash),
          logIndex: r.log_index,
          batchIndex: r.batch_index,
          timestamp: r.timestamp,
          price: r.price ? formatEth(r.price) : null,
        };
      });

      return {
        sales: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-sales-bulk-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
