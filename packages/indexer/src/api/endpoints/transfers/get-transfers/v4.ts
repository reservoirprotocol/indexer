/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import * as Sdk from "@reservoir0x/sdk";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { buildContinuation, fromBuffer, regex, splitContinuation, toBuffer } from "@/common/utils";
import { Assets } from "@/utils/assets";
import { getJoiPriceObject, JoiPrice } from "@/common/joi";
import { config } from "@/config/index";
import _ from "lodash";

const version = "v4";

export const getTransfersV4Options: RouteOptions = {
  description: "Historical token transfers",
  notes: "Get recent transfers for a contract or token.",
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
      limit: Joi.number().integer().min(1).max(100).default(20).description("Max limit is 100."),
      continuation: Joi.string().pattern(regex.base64),
      displayCurrency: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Input any ERC20 address to return result in given currency"),
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
          amount: Joi.string().description("Can be higher than 1 if erc1155."),
          txHash: Joi.string().lowercase().pattern(regex.bytes32),
          block: Joi.number(),
          logIndex: Joi.number(),
          batchIndex: Joi.number(),
          timestamp: Joi.number(),
          isDeleted: Joi.boolean().optional(),
          updatedAt: Joi.string().optional().description("Time when last updated in indexer"),
          price: JoiPrice.allow(null),
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
    query.sortBy = query.sortBy ?? "timestamp"; // Default order by is by timestamp

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
          tokens.collection_id,
          tokens.image_version,
          (tokens.metadata ->> 'image_mime_type')::text as image_mime_type,
          collections.name as collection_name,
          nft_transfer_events."from",
          nft_transfer_events."to",
          nft_transfer_events.amount,
          nft_transfer_events.tx_hash,
          nft_transfer_events."timestamp",
          nft_transfer_events.block,
          nft_transfer_events.log_index,
          nft_transfer_events.batch_index,
          extract(epoch from nft_transfer_events.updated_at) updated_ts,
          nft_transfer_events.is_deleted,
          fe.price,
          fe.currency,
          fe.currency_price
        FROM nft_transfer_events
        LEFT JOIN LATERAL (
          SELECT *
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
        ) fe ON true
        JOIN tokens
          ON nft_transfer_events.address = tokens.contract
          AND nft_transfer_events.token_id = tokens.token_id
        JOIN collections
          ON tokens.collection_id = collections.id
      `;

      // Filters
      const conditions: string[] = [];

      if (!(query.sortBy === "updatedAt")) {
        conditions.push(`nft_transfer_events.is_deleted = 0`);
      }

      // Filter by contract
      if (query.contract) {
        (query as any).contract = toBuffer(query.contract);
        conditions.push(`nft_transfer_events.address = $/contract/`);
      }

      // Filter by token
      if (query.token) {
        const [contract, tokenId] = query.token.split(":");

        (query as any).contract = toBuffer(contract);
        (query as any).tokenId = tokenId;
        conditions.push(`nft_transfer_events.address = $/contract/`);
        conditions.push(`nft_transfer_events.token_id = $/tokenId/`);
      }

      // Filter by collection
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

      // Filter by transaction hash
      if (query.txHash) {
        (query as any).txHash = toBuffer(query.txHash);
        conditions.push(`nft_transfer_events.tx_hash = $/txHash/`);
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

          if (query.contract || query.token) {
            conditions.push(
              `(nft_transfer_events.address, nft_transfer_events.token_id, extract(epoch from nft_transfer_events.updated_at), nft_transfer_events.tx_hash, nft_transfer_events.log_index, nft_transfer_events.batch_index) ${sign} ($/address/, $/tokenId/, $/updatedAt/, $/txHash/, $/logIndex/, $/batchIndex/)`
            );
          } else {
            conditions.push(
              `(extract(epoch from nft_transfer_events.updated_at), nft_transfer_events.address, nft_transfer_events.token_id, nft_transfer_events.tx_hash, nft_transfer_events.log_index, nft_transfer_events.batch_index) ${sign} ($/updatedAt/, $/address/, $/tokenId/, $/txHash/, $/logIndex/, $/batchIndex/)`
            );
          }
        }
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
            nft_transfer_events.token_id ${query.sortDirection},
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

      const result = rawResult.map(async (r) => ({
        token: {
          contract: fromBuffer(r.address),
          tokenId: r.token_id,
          name: r.name,
          image: Assets.getResizedImageUrl(r.image, undefined, r.image_version, r.image_mime_type),
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
        isDeleted: Boolean(r.is_deleted),
        updatedAt: new Date(r.updated_ts * 1000).toISOString(),
        price: r.price
          ? await getJoiPriceObject(
              {
                gross: {
                  amount: String(r.currencyPrice ?? r.price),
                  nativeAmount: String(r.price),
                },
              },
              r.currency ? fromBuffer(r.currency) : Sdk.Common.Addresses.Native[config.chainId],
              query.displayCurrency
            )
          : null,
      }));

      return {
        transfers: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-transfers-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
