/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { getJoiSaleObject, JoiSale } from "@/common/joi";
import { buildContinuation, regex, splitContinuation, toBuffer } from "@/common/utils";
import * as Boom from "@hapi/boom";
import { Assets } from "@/utils/assets";

const version = "v6";

export const getSalesV6Options: RouteOptions = {
  description: "Sales",
  notes:
    "Get recent sales for a contract or token. Paid mints are returned in this `sales` endpoint, free mints can be found in the `/activities/` endpoints. Array of contracts max limit is 20.",
  tags: ["api", "Sales"],
  plugins: {
    "hapi-swagger": {
      order: 8,
    },
  },
  validate: {
    query: Joi.object({
      contract: Joi.alternatives()
        .try(
          Joi.array().items(Joi.string().lowercase().pattern(regex.address)).max(20),
          Joi.string().lowercase().pattern(regex.address)
        )
        .description(
          "Array of contract. Max limit is 20. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      tokens: Joi.alternatives().try(
        Joi.array()
          .max(20)
          .items(Joi.string().lowercase().pattern(regex.token))
          .description(
            "Array of tokens. Max limit is 20. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          ),
        Joi.string()
          .lowercase()
          .pattern(regex.token)
          .description(
            "Array of tokens. Max limit is 20. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          )
      ),
      includeTokenMetadata: Joi.boolean().description(
        "If enabled, also include token metadata in the response. Default is false."
      ),
      includeDeleted: Joi.boolean()
        .description(
          "If enabled, include sales that have been deleted. In some cases the backfilling process deletes sales that are no longer relevant or have been reverted."
        )
        .default(false),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      attributes: Joi.object()
        .unknown()
        .description(
          "Filter to a particular attribute. Attributes are case sensitive. Note: Our docs do not support this parameter correctly. To test, you can use the following URL in your browser. Example: `https://api.reservoir.tools/sales/v6?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attributes[Type]=Original` or `https://api.reservoir.tools/sales/v6?collection=0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63&attributes[Type]=Original&attributes[Type]=Sibling`"
        ),
      sortBy: Joi.string()
        .valid("price", "time", "updatedAt")
        .description(
          "Order the items are returned in the response. Options are `price`, `time`, and `updatedAt`. Default is `time`."
        ),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("desc")
        .description("Order the items are returned in the response."),
      txHash: Joi.string()
        .lowercase()
        .pattern(regex.bytes32)
        .description(
          "Filter to a particular transaction. Example: `0x04654cc4c81882ed4d20b958e0eeb107915d75730110cce65333221439de6afc`"
        ),
      startTimestamp: Joi.number().description(
        "Get events after a particular unix timestamp (inclusive). Relative to the sortBy time filters."
      ),
      endTimestamp: Joi.number().description(
        "Get events before a particular unix timestamp (inclusive). Relative to the sortBy time filters."
      ),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(1000)
        .default(100)
        .description("Amount of items returned in response. Max limit is 1000."),
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
    })
      .oxor("contract", "tokens", "collection", "txHash")
      .with("attributes", "collection"),
  },
  response: {
    schema: Joi.object({
      sales: Joi.array().items(JoiSale),
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
    let contractFilter = "";
    let tokensFilter = "";
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
      contractFilter = `fill_events_2.contract IN ($/contractsFilter:raw/)`;
    } else if (query.tokens) {
      if (!_.isArray(query.tokens)) {
        query.tokens = [query.tokens];
      }

      for (const token of query.tokens) {
        const [contract, tokenId] = token.split(":");
        const tokensFilter = `('${_.replace(contract, "0x", "\\x")}', '${tokenId}')`;

        if (_.isUndefined((query as any).tokensFilter)) {
          (query as any).tokensFilter = [];
        }

        (query as any).tokensFilter.push(tokensFilter);
      }

      (query as any).tokensFilter = _.join((query as any).tokensFilter, ",");

      tokensFilter = `(fill_events_2.contract, fill_events_2.token_id) IN ($/tokensFilter:raw/)`;
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

    // We default in the code so that these values don't appear in the docs
    if (!query.startTimestamp) {
      query.startTimestamp = 0;
    }
    if (!query.endTimestamp) {
      query.endTimestamp = 9999999999;
    }

    if (query.continuation) {
      const contArr = splitContinuation(query.continuation, /^(.+)_(\d+)_(\d+)_(\d+)$/);

      if (contArr.length !== 4) {
        throw Boom.badRequest("Invalid continuation string used");
      }

      (query as any).timestamp = contArr[0];
      (query as any).logIndex = contArr[1];
      (query as any).batchIndex = contArr[2];
      (query as any).price = contArr[3];
      const inequalitySymbol = query.sortDirection === "asc" ? ">" : "<";

      if (
        _.floor(Number(query.timestamp)) < query.startTimestamp ||
        _.floor(Number(query.timestamp)) > query.endTimestamp
      ) {
        const log = `Continuation timestamp ${_.floor(Number(query.timestamp))} out of range ${
          query.startTimestamp
        } - ${query.endTimestamp} request ${JSON.stringify(query)} x-api-key ${
          request.headers["x-api-key"]
        }`;

        logger.info("transfers-sales", log);
        throw Boom.badRequest(
          `Continuation timestamp ${_.floor(Number(query.timestamp))} out of range ${
            query.startTimestamp
          } - ${query.endTimestamp}`
        );
      }

      if (query.sortBy && query.sortBy === "price") {
        paginationFilter = `
        AND (fill_events_2.price) ${inequalitySymbol} ($/price/)
      `;
      } else if (query.sortBy && query.sortBy === "updatedAt") {
        paginationFilter = `
        AND (fill_events_2.updated_at, fill_events_2.log_index, fill_events_2.batch_index) ${inequalitySymbol} (to_timestamp($/timestamp/), $/logIndex/, $/batchIndex/)
        `;
      } else {
        paginationFilter = `
        AND (fill_events_2.timestamp, fill_events_2.log_index, fill_events_2.batch_index) ${inequalitySymbol} ($/timestamp/, $/logIndex/, $/batchIndex/)
        `;
      }
    }

    // Default to ordering by time
    let queryOrderBy = `ORDER BY fill_events_2.timestamp ${query.sortDirection}, fill_events_2.log_index ${query.sortDirection}, fill_events_2.batch_index ${query.sortDirection}`;
    let timestampFilter = `
      AND (fill_events_2.timestamp >= $/startTimestamp/ AND
      fill_events_2.timestamp <= $/endTimestamp/)
    `;

    if (query.sortBy && query.sortBy === "price") {
      queryOrderBy = `ORDER BY fill_events_2.price ${query.sortDirection}`;
    } else if (query.sortBy && query.sortBy === "updatedAt") {
      queryOrderBy = `ORDER BY fill_events_2.updated_at ${query.sortDirection}`;
      timestampFilter = `
        AND fill_events_2.updated_at >= to_timestamp($/startTimestamp/) AND
        fill_events_2.updated_at <= to_timestamp($/endTimestamp/)
      `;
    }

    try {
      const baseQuery = `
        SELECT
          fill_events_2_data.*
          ${
            query.includeTokenMetadata
              ? `
                  ,
                  tokens_data.name,
                  tokens_data.image,
                  tokens_data.collection_id,
                  tokens_data.collection_name,
                  tokens_data.image_version
                `
              : ""
          }
        FROM (
          SELECT
            fill_events_2.contract,
            fill_events_2.token_id,
            fill_events_2.order_id,
            fill_events_2.order_side,
            fill_events_2.order_kind,
            fill_events_2.order_source_id_int,
            fill_events_2.maker,
            fill_events_2.taker,
            fill_events_2.amount,
            fill_events_2.fill_source_id,
            fill_events_2.block,
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
            fill_events_2.wash_trading_score,
            fill_events_2.royalty_fee_bps,
            fill_events_2.marketplace_fee_bps,
            fill_events_2.royalty_fee_breakdown,
            fill_events_2.marketplace_fee_breakdown,
            fill_events_2.paid_full_royalty,
            fill_events_2.is_deleted,
            extract(epoch from fill_events_2.updated_at) updated_ts,
            fill_events_2.created_at
          FROM fill_events_2
          LEFT JOIN currencies
            ON fill_events_2.currency = currencies.contract
          ${tokenJoins}
          WHERE
            ${collectionFilter}
            ${contractFilter}
            ${tokensFilter}
            ${paginationFilter}
            ${timestampFilter}
            ${query.includeDeleted ? "AND TRUE" : "AND is_deleted = 0"}
            ${queryOrderBy}
          LIMIT $/limit/
        ) AS fill_events_2_data
        ${
          query.includeTokenMetadata
            ? `
                LEFT JOIN LATERAL (
                  SELECT
                    tokens.name,
                    tokens.image,
                    tokens.collection_id,
                    tokens.image_version,
                    collections.name AS collection_name
                  FROM tokens
                  LEFT JOIN collections 
                    ON tokens.collection_id = collections.id
                  WHERE fill_events_2_data.token_id = tokens.token_id
                    AND fill_events_2_data.contract = tokens.contract
                ) tokens_data ON TRUE
              `
            : ""
        }
      `;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;
      if (rawResult.length === query.limit) {
        const result = rawResult[rawResult.length - 1];
        const timestamp =
          query.sortBy && query.sortBy === "updatedAt" ? result.updated_ts : result.timestamp;

        if (
          _.floor(Number(timestamp)) < query.startTimestamp ||
          _.floor(Number(timestamp)) > query.endTimestamp
        ) {
          const log = `Returned continuation timestamp ${_.floor(Number(timestamp))} out of range ${
            query.startTimestamp
          } - ${query.endTimestamp} last raw ${JSON.stringify(rawResult)} x-api-key ${
            request.headers["x-api-key"]
          }`;

          logger.info("transfers-sales", log);
        }

        continuation = buildContinuation(
          timestamp + "_" + result.log_index + "_" + result.batch_index + "_" + result.price
        );
      }

      const result = rawResult.map(async (r) => {
        return await getJoiSaleObject({
          prices: {
            gross: {
              amount: r.currency_price ?? r.price,
              nativeAmount: r.price,
              usdAmount: r.usd_price,
            },
          },
          fees: {
            royaltyFeeBps: r.royalty_fee_bps,
            marketplaceFeeBps: r.marketplace_fee_bps,
            paidFullRoyalty: r.paid_full_royalty,
            royaltyFeeBreakdown: r.royalty_fee_breakdown,
            marketplaceFeeBreakdown: r.marketplace_fee_breakdown,
          },
          currencyAddress: r.currency,
          timestamp: r.timestamp,
          contract: r.contract,
          tokenId: r.token_id,
          name: r.name,
          image: Assets.getResizedImageUrl(r.image, undefined, r.image_version),
          collectionId: r.collection_id,
          collectionName: r.collection_name,
          washTradingScore: r.wash_trading_score,
          orderId: r.order_id,
          orderSourceId: r.order_source_id_int,
          orderSide: r.order_side,
          orderKind: r.order_kind,
          maker: r.maker,
          taker: r.taker,
          amount: r.amount,
          fillSourceId: r.fill_source_id,
          block: r.block,
          txHash: r.tx_hash,
          logIndex: r.log_index,
          batchIndex: r.batch_index,
          isDeleted: Boolean(r.is_deleted),
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_ts * 1000).toISOString(),
        });
      });

      return {
        sales: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-sales-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
