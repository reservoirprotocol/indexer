/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import crypto from "crypto";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import {
  buildContinuation,
  formatEth,
  formatPrice,
  formatUsd,
  fromBuffer,
  regex,
  splitContinuation,
  toBuffer,
} from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { Assets } from "@/utils/assets";

const version = "v3";

export const getSalesV3Options: RouteOptions = {
  description: "Historical sales",
  notes:
    "Get recent sales for a contract or token. Note: this API is returns rich metadata, and has advanced filters, so is only designed for small amounts of recent sales. If you want access to sales in bulk, use the `Aggregator > Bulk Sales` API.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.alternatives()
        .try(
          Joi.array().items(Joi.string().lowercase().pattern(regex.address)).max(20),
          Joi.string().lowercase().pattern(regex.address)
        )
        .description("Array of contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"),
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      attributes: Joi.object()
        .unknown()
        .description("Filter to a particular attribute. Example: `attributes[Type]=Original`"),
      txHash: Joi.string()
        .lowercase()
        .pattern(regex.bytes32)
        .description(
          "Filter to a particular transaction. Example: `0x04654cc4c81882ed4d20b958e0eeb107915d75730110cce65333221439de6afc`"
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
        .max(100)
        .default(20)
        .description("Amount of items returned in response."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
    })
      .oxor("contract", "token", "collection", "txHash")
      .with("attributes", "collection"),
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
            name: Joi.string().allow("", null),
            image: Joi.string().allow("", null),
            collection: Joi.object({
              id: Joi.string().allow(null),
              name: Joi.string().allow("", null),
            }),
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
          currency: Joi.string().pattern(regex.address),
          currencyPrice: Joi.number().unsafe().allow(null),
          usdPrice: Joi.number().unsafe().allow(null),
          washTradingScore: Joi.number(),
        })
      ),
      continuation: Joi.string().pattern(regex.base64).allow(null),
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
      if (!_.isArray(query.contract)) {
        query.contract = [query.contract];
      }

      for (const contract of query.contract) {
        const contractsFilter = `'${_.replace(contract, "0x", "\\x")}'`;

        if (_.isUndefined((query as any).contractsFilter)) {
          (query as any).contractsFilter = [];
        }

        (query as any).contractsFilter.push(contractsFilter);
      }

      (query as any).contractsFilter = _.join((query as any).contractsFilter, ",");
      tokenFilter = `fill_events_2.contract IN ($/contractsFilter:raw/)`;
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
    } else if (query.txHash) {
      (query as any).txHash = toBuffer(query.txHash);
      collectionFilter = `fill_events_2.tx_hash = $/txHash/`;
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
            fill_events_2.currency,
            TRUNC(fill_events_2.currency_price, 0) AS currency_price,
            currencies.decimals,
            fill_events_2.usd_price,
            fill_events_2.block,
            fill_events_2.log_index,
            fill_events_2.batch_index,
            fill_events_2.wash_trading_score
          FROM fill_events_2
          LEFT JOIN currencies
            ON fill_events_2.currency = currencies.contract
          ${tokenJoins}
          WHERE
            ${collectionFilter}
            ${tokenFilter}
            ${paginationFilter}
            ${timestampFilter}
            AND is_deleted = 0
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
            name: r.name,
            image: Assets.getResizedImageUrl(r.image),
            collection: {
              id: r.collection_id,
              name: r.collection_name,
            },
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
          currency:
            fromBuffer(r.currency) === AddressZero
              ? r.order_side === "sell"
                ? Sdk.Common.Addresses.Native[config.chainId]
                : Sdk.Common.Addresses.WNative[config.chainId]
              : fromBuffer(r.currency),
          currencyPrice: r.currency_price
            ? formatPrice(r.currency_price, r.decimals)
            : r.price
            ? formatEth(r.price)
            : null,
          usdPrice: r.usd_price ? formatUsd(r.usd_price) : null,
          washTradingScore: r.wash_trading_score,
        };
      });

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
