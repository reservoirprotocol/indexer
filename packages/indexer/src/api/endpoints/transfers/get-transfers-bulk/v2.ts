/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import crypto from "crypto";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { buildContinuation, fromBuffer, regex, splitContinuation, toBuffer } from "@/common/utils";
import * as Boom from "@hapi/boom";

const version = "v2";

export const getTransfersBulkV2Options: RouteOptions = {
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
      txHash: Joi.alternatives()
        .try(
          Joi.array().max(80).items(Joi.string().lowercase().pattern(regex.bytes32)),
          Joi.string().lowercase().pattern(regex.bytes32)
        )
        .description(
          "Filter to a particular transaction. Example: `0x04654cc4c81882ed4d20b958e0eeb107915d75730110cce65333221439de6afc`"
        ),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(100)
        .description("Amount of items returned in response. Max limit is 1000."),
      sortBy: Joi.string()
        .valid("timestamp", "updatedAt")
        .description(
          "Order the items are returned in the response. Options are `timestamp`, and `updatedAt`. Default is `timestamp`."
        ),
      sortDirection: Joi.string()
        .lowercase()
        .when("sortBy", {
          is: Joi.valid("updatedAt"),
          then: Joi.valid("asc", "desc").default("desc"),
          otherwise: Joi.valid("desc").default("desc"),
        }),
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
          amount: Joi.string().description("Can be more than 1 if erc1155."),
          block: Joi.number(),
          txHash: Joi.string().lowercase().pattern(regex.bytes32),
          logIndex: Joi.number(),
          batchIndex: Joi.number(),
          timestamp: Joi.number(),
          isDeleted: Joi.boolean().optional(),
          updatedAt: Joi.string().optional().description("Time when updated in indexer"),
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
    query.sortBy = query.sortBy ?? "timestamp"; // Default order by is by timestamp

    try {
      let baseQuery = `
        SELECT
          nft_transfer_events.address,
          nft_transfer_events.token_id,
          nft_transfer_events."from",
          nft_transfer_events."to",
          nft_transfer_events.amount,
          nft_transfer_events.tx_hash,
          nft_transfer_events."timestamp",
          nft_transfer_events.block,
          nft_transfer_events.log_index,
          nft_transfer_events.batch_index,
          nft_transfer_events.is_deleted,
          extract(epoch from nft_transfer_events.updated_at) updated_ts
        FROM nft_transfer_events
      `;

      // Filters
      const conditions: string[] = [];
      conditions.push(`nft_transfer_events.is_deleted = 0`);

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

      if (query.txHash) {
        if (Array.isArray(query.txHash)) {
          query.txHash = query.txHash.map((txHash: string) => toBuffer(txHash));
          conditions.push(`nft_transfer_events.tx_hash IN ($/txHash:csv/)`);
        } else {
          (query as any).txHash = toBuffer(query.txHash);
          conditions.push(`nft_transfer_events.tx_hash = $/txHash/`);
        }
      }

      // We default in the code so that these values don't appear in the docs
      if (!query.startTimestamp) {
        query.startTimestamp = 0;
      }

      if (!query.endTimestamp) {
        query.endTimestamp = 9999999999;
      }

      if (query.continuation) {
        if (query.sortBy === "timestamp") {
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
        } else if (query.sortBy == "updatedAt") {
          const [updateAt, address, tokenId, txHash, logIndex, batchIndex] = splitContinuation(
            query.continuation,
            /^(.+)_0x[a-fA-F0-9]{40}_(\d+)_0x[a-fA-F0-9]{64}_(\d+)_(\d+)$/
          );

          (query as any).updatedAt = updateAt;
          (query as any).address = toBuffer(address);
          (query as any).tokenId = tokenId;
          (query as any).txHash = toBuffer(txHash);
          (query as any).logIndex = logIndex;
          (query as any).batchIndex = batchIndex;
          const sign = query.sortDirection == "desc" ? "<" : ">";

          if (
            _.floor(Number(updateAt)) < query.startTimestamp ||
            _.floor(Number(updateAt)) > query.endTimestamp
          ) {
            const log = `Continuation updatedAt ${_.floor(Number(updateAt))} out of range ${
              query.startTimestamp
            } - ${query.endTimestamp} request ${JSON.stringify(query)} x-api-key ${
              request.headers["x-api-key"]
            }`;

            logger.info("transfers-bulk", log);
            throw Boom.badRequest(
              `Continuation updatedAt ${_.floor(Number(updateAt))} out of range ${
                query.startTimestamp
              } - ${query.endTimestamp}`
            );
          }

          if (query.token) {
            conditions.push(
              `(nft_transfer_events.address, nft_transfer_events.token_id, nft_transfer_events.updated_at, tx_hash, log_index, batch_index) ${sign} ($/address/, $/tokenId/, to_timestamp($/updatedAt/), $/txHash/, $/logIndex/, $/batchIndex/)`
            );
          } else if (query.contract) {
            conditions.push(
              `(nft_transfer_events.address, nft_transfer_events.updated_at, tx_hash, log_index, batch_index) ${sign} ($/address/, to_timestamp($/updatedAt/), $/txHash/, $/logIndex/, $/batchIndex/)`
            );
          } else {
            conditions.push(
              `(nft_transfer_events.updated_at, nft_transfer_events.address, nft_transfer_events.token_id, tx_hash, log_index, batch_index) ${sign} (to_timestamp($/updatedAt/), $/address/, $/tokenId/, $/txHash/, $/logIndex/, $/batchIndex/)`
            );
          }
        }
      }

      if (query.sortBy === "timestamp") {
        conditions.push(`
          (nft_transfer_events.timestamp >= $/startTimestamp/ AND
          nft_transfer_events.timestamp <= $/endTimestamp/)
        `);
      } else if (query.sortBy == "updatedAt") {
        conditions.push(`
          (nft_transfer_events.updated_at >= to_timestamp($/startTimestamp/) AND
          nft_transfer_events.updated_at <= to_timestamp($/endTimestamp/))
        `);
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      if (query.sortBy === "timestamp") {
        baseQuery += `
          ORDER BY
            nft_transfer_events.timestamp DESC,
            nft_transfer_events.log_index DESC,
            nft_transfer_events.batch_index DESC
        `;
      } else if (query.sortBy == "updatedAt") {
        if (query.contract || query.token) {
          baseQuery += `
          ORDER BY
            nft_transfer_events.address ${query.sortDirection},
            ${query.token ? `nft_transfer_events.token_id ${query.sortDirection},` : ""}
            nft_transfer_events.updated_at ${query.sortDirection},
            nft_transfer_events.tx_hash ${query.sortDirection},
            nft_transfer_events.log_index ${query.sortDirection},
            nft_transfer_events.batch_index ${query.sortDirection}
        `;
        } else {
          baseQuery += `
          ORDER BY
            nft_transfer_events.updated_at ${query.sortDirection},
            nft_transfer_events.address ${query.sortDirection},
            nft_transfer_events.token_id ${query.sortDirection},
            nft_transfer_events.tx_hash ${query.sortDirection},
            nft_transfer_events.log_index ${query.sortDirection},
            nft_transfer_events.batch_index ${query.sortDirection}
        `;
        }
      }

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        if (query.sortBy === "timestamp") {
          continuation = buildContinuation(
            rawResult[rawResult.length - 1].timestamp +
              "_" +
              rawResult[rawResult.length - 1].log_index +
              "_" +
              rawResult[rawResult.length - 1].batch_index
          );
        } else if (query.sortBy == "updatedAt") {
          if (
            _.floor(Number(rawResult[rawResult.length - 1].updated_ts)) < query.startTimestamp ||
            _.floor(Number(rawResult[rawResult.length - 1].updated_ts)) > query.endTimestamp
          ) {
            const log = `Returned continuation updatedAt ${_.floor(
              Number(rawResult[rawResult.length - 1].updated_ts)
            )} out of range ${query.startTimestamp} - ${
              query.endTimestamp
            } last raw ${JSON.stringify(rawResult)} x-api-key ${request.headers["x-api-key"]}`;

            logger.info("transfers-bulk", log);
          }

          continuation = buildContinuation(
            rawResult[rawResult.length - 1].updated_ts +
              "_" +
              fromBuffer(rawResult[rawResult.length - 1].address) +
              "_" +
              rawResult[rawResult.length - 1].token_id +
              "_" +
              fromBuffer(rawResult[rawResult.length - 1].tx_hash) +
              "_" +
              rawResult[rawResult.length - 1].log_index +
              "_" +
              rawResult[rawResult.length - 1].batch_index
          );
        }
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
        isDeleted: Boolean(r.is_deleted),
        updatedAt: new Date(r.updated_ts * 1000).toISOString(),
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
