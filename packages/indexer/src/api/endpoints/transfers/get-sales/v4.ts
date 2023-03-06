/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import crypto from "crypto";
import Joi from "joi";
import _ from "lodash";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiPrice, getJoiPriceObject } from "@/common/joi";
import { buildContinuation, fromBuffer, regex, splitContinuation, toBuffer } from "@/common/utils";
import { Sources } from "@/models/sources";
import { Assets } from "@/utils/assets";
import * as Boom from "@hapi/boom";

const version = "v4";

export const getSalesV4Options: RouteOptions = {
  description: "Sales",
  notes: "Get recent sales for a contract or token.",
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
        .description("Array of contract. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"),
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      includeTokenMetadata: Joi.boolean().description(
        "If enabled, also include token metadata in the response."
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
        .max(1000)
        .default(100)
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
          orderSide: Joi.string().valid("ask", "bid"),
          orderKind: Joi.string(),
          orderId: Joi.string().allow(null),
          from: Joi.string().lowercase().pattern(regex.address),
          to: Joi.string().lowercase().pattern(regex.address),
          amount: Joi.string(),
          fillSource: Joi.string().allow(null),
          block: Joi.number(),
          txHash: Joi.string().lowercase().pattern(regex.bytes32),
          logIndex: Joi.number(),
          batchIndex: Joi.number(),
          timestamp: Joi.number(),
          price: JoiPrice,
          washTradingScore: Joi.number(),
          royaltyFeeBps: Joi.number(),
          marketplaceFeeBps: Joi.number(),
          paidFullRoyalty: Joi.boolean(),
          feeBreakdown: Joi.array().items(
            Joi.object({
              kind: Joi.string(),
              bps: Joi.number(),
              recipient: Joi.string(),
            })
          ),
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
      const contArr = splitContinuation(query.continuation, /^(\d+)_(\d+)_(\d+)$/);

      if (contArr.length !== 3) {
        throw Boom.badRequest("Invalid continuation string used");
      }

      (query as any).timestamp = contArr[0];
      (query as any).logIndex = contArr[1];
      (query as any).batchIndex = contArr[2];

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
          fill_events_2_data.*
          ${
            query.includeTokenMetadata
              ? `
                  ,
                  tokens_data.name,
                  tokens_data.image,
                  tokens_data.collection_id,
                  tokens_data.collection_name
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
            fill_events_2.paid_full_royalty
          FROM fill_events_2
          LEFT JOIN currencies
            ON fill_events_2.currency = currencies.contract
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
        ${
          query.includeTokenMetadata
            ? `
                LEFT JOIN LATERAL (
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
              `
            : ""
        }
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
      const result = rawResult.map(async (r) => {
        const orderSource =
          r.order_source_id_int !== null ? sources.get(Number(r.order_source_id_int)) : undefined;
        const fillSource =
          r.fill_source_id !== null ? sources.get(Number(r.fill_source_id)) : undefined;

        const feeInfoIsValid = (r.royalty_fee_bps ?? 0) + (r.marketplace_fee_bps ?? 0) < 10000;

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
            name: r.name ?? null,
            image: Assets.getLocalAssetsLink(r.image) ?? null,
            collection: {
              id: r.collection_id ?? null,
              name: r.collection_name ?? null,
            },
          },
          orderId: r.order_id,
          orderSource: orderSource?.domain ?? null,
          orderSide: r.order_side === "sell" ? "ask" : "bid",
          orderKind: r.order_kind,
          from: r.order_side === "sell" ? fromBuffer(r.maker) : fromBuffer(r.taker),
          to: r.order_side === "sell" ? fromBuffer(r.taker) : fromBuffer(r.maker),
          amount: String(r.amount),
          fillSource: fillSource?.domain ?? orderSource?.domain ?? null,
          block: r.block,
          txHash: fromBuffer(r.tx_hash),
          logIndex: r.log_index,
          batchIndex: r.batch_index,
          timestamp: r.timestamp,
          price: await getJoiPriceObject(
            {
              gross: {
                amount: r.currency_price ?? r.price,
                nativeAmount: r.price,
                usdAmount: r.usd_price,
              },
            },
            fromBuffer(r.currency),
            (r.royalty_fee_bps ?? 0) + (r.marketplace_fee_bps ?? 0)
          ),
          washTradingScore: r.wash_trading_score,
          royaltyFeeBps:
            r.royalty_fee_bps !== null && feeInfoIsValid ? r.royalty_fee_bps : undefined,
          marketplaceFeeBps:
            r.marketplace_fee_bps !== null && feeInfoIsValid ? r.marketplace_fee_bps : undefined,
          paidFullRoyalty:
            r.paid_full_royalty !== null && feeInfoIsValid ? r.paid_full_royalty : undefined,
          feeBreakdown:
            (r.royalty_fee_breakdown !== null || r.marketplace_fee_breakdown !== null) &&
            feeInfoIsValid
              ? [].concat(
                  (r.royalty_fee_breakdown ?? []).map((detail: any) => {
                    return {
                      kind: "royalty",
                      ...detail,
                    };
                  }),
                  (r.marketplace_fee_breakdown ?? []).map((detail: any) => {
                    return {
                      kind: "marketplace",
                      ...detail,
                    };
                  })
                )
              : undefined,
        };
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
