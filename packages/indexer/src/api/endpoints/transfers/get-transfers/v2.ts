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
import { Assets } from "@/utils/assets";

const version = "v2";

export const getTransfersV2Options: RouteOptions = {
  description: "Historical token transfers",
  notes: "Get recent transfers for a contract or token.",
  tags: ["api", "x-deprecated"],
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
          "Filter to a particular contract, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
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
        .description(
          "Filter to a particular attribute. Note: Our docs do not support this parameter correctly. To test, you can use the following URL in your browser. Example: `https://api.reservoir.tools/transfers/v2?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attributes[Type]=Original` or `https://api.reservoir.tools/transfers/v2?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attributes[Type]=Original&attributes[Type]=Sibling`"
        ),
      txHash: Joi.string()
        .lowercase()
        .pattern(regex.bytes32)
        .description(
          "Filter to a particular transaction. Example: `0x04654cc4c81882ed4d20b958e0eeb107915d75730110cce65333221439de6afc`"
        ),
      limit: Joi.number().integer().min(1).max(100).default(20),
      continuation: Joi.string().pattern(regex.base64),
    })
      .oxor("contract", "token", "collection", "txHash")
      .or("contract", "token", "collection", "txHash")
      .with("attributes", "collection"),
  },
  response: {
    schema: Joi.object({
      transfers: Joi.array().items(
        Joi.object({
          token: Joi.object({
            contract: Joi.string().lowercase().pattern(regex.address),
            tokenId: Joi.string().pattern(regex.number),
            name: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow("", null),
            }),
          }),
          from: Joi.string().lowercase().pattern(regex.address),
          to: Joi.string().lowercase().pattern(regex.address),
          amount: Joi.string(),
          txHash: Joi.string().lowercase().pattern(regex.bytes32),
          block: Joi.number(),
          logIndex: Joi.number(),
          batchIndex: Joi.number(),
          timestamp: Joi.number(),
          price: Joi.number().unsafe().allow(null),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getTransfers${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-transfers-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      // Associating sales to transfers is done by searching for transfer
      // and sale events that occurred close to each other. In most cases
      // we will first have the transfer followed by the sale but we have
      // some exceptions.
      let baseQuery = `
        SELECT
          nft_transfer_events.address,
          nft_transfer_events.token_id,
          tokens.name,
          tokens.image,
          tokens.image_version,
          tokens.collection_id,
          collections.name as collection_name,
          nft_transfer_events.from,
          nft_transfer_events.to,
          nft_transfer_events.amount,
          nft_transfer_events.tx_hash,
          nft_transfer_events.timestamp,
          nft_transfer_events.block,
          nft_transfer_events.log_index,
          nft_transfer_events.batch_index,
          (
            SELECT fill_events_2.price
            FROM fill_events_2
            WHERE fill_events_2.tx_hash = nft_transfer_events.tx_hash
              AND fill_events_2.log_index = nft_transfer_events.log_index + (
                CASE
                  WHEN fill_events_2.order_kind = 'x2y2' THEN 2
                  WHEN fill_events_2.order_kind::text LIKE 'seaport%' THEN -2
                  ELSE 1
                END
              )
            LIMIT 1
          ) AS price
        FROM nft_transfer_events
        JOIN tokens
          ON nft_transfer_events.address = tokens.contract
          AND nft_transfer_events.token_id = tokens.token_id
        JOIN collections
          ON tokens.collection_id = collections.id
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
      if (query.collection) {
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
            baseQuery += `
              JOIN token_attributes ta${i}
                ON nft_transfer_events.address = ta${i}.contract
                AND nft_transfer_events.token_id = ta${i}.token_id
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
          conditions.push(`nft_transfer_events.address = $/contract/`);
          conditions.push(`nft_transfer_events.token_id >= $/startTokenId/`);
          conditions.push(`nft_transfer_events.token_id <= $/endTokenId/`);
        } else {
          (query as any).contract = toBuffer(query.collection);
          conditions.push(`nft_transfer_events.address = $/contract/`);
        }
      }

      if (query.txHash) {
        (query as any).txHash = toBuffer(query.txHash);
        conditions.push(`nft_transfer_events.tx_hash = $/txHash/`);
      }

      if (query.continuation) {
        const [timestamp, logIndex, batchIndex] = splitContinuation(
          query.continuation,
          /^(\d+)_(\d+)_(\d+)$/
        );
        (query as any).timestamp = timestamp;
        (query as any).logIndex = logIndex;
        (query as any).batchIndex = batchIndex;

        conditions.push(
          `(nft_transfer_events.timestamp, nft_transfer_events.log_index, nft_transfer_events.batch_index) < ($/timestamp/, $/logIndex/, $/batchIndex/)`
        );
      }

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
        token: {
          contract: fromBuffer(r.address),
          tokenId: r.token_id,
          name: r.name,
          image: Assets.getResizedImageUrl(r.image, undefined, r.image_version),
          collection: {
            id: r.collection_id,
            name: r.collection_name,
          },
        },
        from: fromBuffer(r.from),
        to: fromBuffer(r.to),
        amount: String(r.amount),
        block: r.block,
        txHash: fromBuffer(r.tx_hash),
        logIndex: r.log_index,
        batchIndex: r.batch_index,
        timestamp: r.timestamp,
        price: r.price ? formatEth(r.price) : null,
      }));

      return {
        transfers: result,
        continuation,
      };
    } catch (error) {
      logger.error(`get-transfers-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
