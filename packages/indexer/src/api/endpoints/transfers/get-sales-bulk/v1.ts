/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import crypto from "crypto";
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

const version = "v1";

export const getSalesBulkV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 5000,
  },
  description: "Bulk historical sales",
  notes:
    "Note: this API is optimized for bulk access, and offers minimal filters/metadata. If you need more flexibility, try the `NFT API > Sales` endpoint",
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
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
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
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
    }),
  },
  response: {
    schema: Joi.object({
      sales: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          saleId: Joi.string(),
          token: Joi.object({
            contract: Joi.string().lowercase().pattern(regex.address),
            tokenId: Joi.string().pattern(regex.number),
          }),
          orderSource: Joi.string().allow("", null),
          orderSourceDomain: Joi.string().allow("", null),
          orderSide: Joi.string().valid("ask", "bid"),
          orderKind: Joi.string(),
          from: Joi.string().lowercase().pattern(regex.address),
          to: Joi.string().lowercase().pattern(regex.address),
          amount: Joi.string(),
          fillSource: Joi.string().allow(null),
          txHash: Joi.string().lowercase().pattern(regex.bytes32),
          logIndex: Joi.number(),
          batchIndex: Joi.number(),
          timestamp: Joi.number(),
          price: Joi.number().unsafe().allow(null),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
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
            fill_events_2.fill_source_id,
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
        const orderSource = sources.get(Number(r.order_source_id_int));
        const fillSource = sources.get(Number(r.fill_source_id));

        return {
          id: crypto
            .createHash("sha256")
            .update(`${fromBuffer(r.tx_hash)}${r.log_index}${r.batch_index}`)
            .digest("hex"),
          saleId: crypto
            .createHash("sha256")
            .update(
              `${fromBuffer(r.tx_hash)}${r.maker}${r.taker}${r.contract}${r.token_id}${r.price}`
            )
            .digest("hex"),
          token: {
            contract: fromBuffer(r.contract),
            tokenId: r.token_id,
          },
          orderSource: orderSource?.getTitle() ?? null,
          orderSourceDomain: orderSource?.domain ?? null,
          orderSide: r.order_side === "sell" ? "ask" : "bid",
          orderKind: r.order_kind,
          from: r.order_side === "sell" ? fromBuffer(r.maker) : fromBuffer(r.taker),
          to: r.order_side === "sell" ? fromBuffer(r.taker) : fromBuffer(r.maker),
          amount: String(r.amount),
          fillSource: fillSource?.domain ?? orderSource?.domain ?? null,
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
