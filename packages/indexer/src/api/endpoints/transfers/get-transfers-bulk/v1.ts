/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import crypto from "crypto";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { buildContinuation, fromBuffer, regex, splitContinuation, toBuffer } from "@/common/utils";

const version = "v1";

export const getTransfersBulkV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 5000,
  },
  description: "Bulk historical transfers",
  notes:
    "Note: this API is optimized for bulk access, and offers minimal filters/metadata. If you need more flexibility, try the `NFT API > Transfers` endpoint",
  tags: ["api", "Transfers"],
  plugins: {
    "hapi-swagger": {
      order: 10,
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
      transfers: Joi.array().items(
        Joi.object({
          id: Joi.string(),
          token: Joi.object({
            contract: Joi.string().lowercase().pattern(regex.address),
            tokenId: Joi.string().pattern(regex.number),
          }),
          from: Joi.string().lowercase().pattern(regex.address),
          to: Joi.string().lowercase().pattern(regex.address),
          amount: Joi.string(),
          block: Joi.number(),
          txHash: Joi.string().lowercase().pattern(regex.bytes32),
          logIndex: Joi.number(),
          batchIndex: Joi.number(),
          timestamp: Joi.number(),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getTransfersBulk${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-transfers-bulk-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          nft_transfer_events.address,
          nft_transfer_events.token_id,
          nft_transfer_events.from,
          nft_transfer_events.to,
          nft_transfer_events.amount,
          nft_transfer_events.tx_hash,
          nft_transfer_events.timestamp,
          nft_transfer_events.block,
          nft_transfer_events.log_index,
          nft_transfer_events.batch_index
        FROM nft_transfer_events
      `;

      // Filters
      const conditions: string[] = [];
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`nft_transfer_events.address = $/contract/`);
      }
      if (query.token) {
        const [contract, tokenId] = query.token.split(":");

        (query as any).contract = toBuffer(contract);
        (query as any).tokenId = tokenId;
        conditions.push(`nft_transfer_events.address = $/contract/`);
        conditions.push(`nft_transfer_events.token_id = $/tokenId/`);
      }

      if (query.continuation) {
        const [timestamp, logIndex, batchIndex] = splitContinuation(
          query.continuation,
          /^(\d+)_(\d+)_(\d+)$/
        );
        (query as any).timestamp = _.toInteger(timestamp);
        (query as any).logIndex = logIndex;
        (query as any).batchIndex = batchIndex;

        conditions.push(
          `(nft_transfer_events.timestamp, nft_transfer_events.log_index, nft_transfer_events.batch_index) < ($/timestamp/, $/logIndex/, $/batchIndex/)`
        );
      }

      // We default in the code so that these values don't appear in the docs
      if (!query.startTimestamp) {
        query.startTimestamp = 0;
      }
      if (!query.endTimestamp) {
        query.endTimestamp = 9999999999;
      }
      conditions.push(`
        (nft_transfer_events.timestamp >= $/startTimestamp/ AND
        nft_transfer_events.timestamp <= $/endTimestamp/)
      `);

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += `
        ORDER BY
          nft_transfer_events.timestamp DESC,
          nft_transfer_events.log_index DESC,
          nft_transfer_events.batch_index DESC
      `;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

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

      const result = rawResult.map((r) => ({
        id: crypto
          .createHash("sha256")
          .update(`${fromBuffer(r.tx_hash)}${r.log_index}${r.batch_index}`)
          .digest("hex"),
        token: {
          contract: fromBuffer(r.address),
          tokenId: r.token_id,
        },
        from: fromBuffer(r.from),
        to: fromBuffer(r.to),
        amount: String(r.amount),
        block: r.block,
        txHash: fromBuffer(r.tx_hash),
        logIndex: r.log_index,
        batchIndex: r.batch_index,
        timestamp: r.timestamp,
      }));

      return {
        transfers: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-transfers-bulk-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
