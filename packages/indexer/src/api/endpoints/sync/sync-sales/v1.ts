/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiSale, getJoiSaleObject } from "@/common/joi";
import { buildContinuation, fromBuffer, regex, splitContinuation, toBuffer } from "@/common/utils";
import * as Boom from "@hapi/boom";

const version = "v1";

export const getSyncSalesV1Options: RouteOptions = {
  description: "Sync Sales",
  notes:
    "This API is optimized for bulk access to sales for syncing a remote database. Thus it offers minimal filters/metadata.",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 8,
    },
  },
  validate: {
    query: Joi.object({
      continuation: Joi.string()
        .pattern(regex.base64)
        .description("Use continuation token to request next offset of items."),
    }),
  },
  response: {
    schema: Joi.object({
      sales: Joi.array().items(JoiSale),
      continuation: Joi.string().pattern(regex.base64).allow(null),
      cursor: Joi.string().pattern(regex.base64).allow(null),
    }).label(`getSales${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`sync-sales-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request, h) => {
    const query = request.query as any;
    const LIMIT = 1000;
    const CACHE_TTL = 1000 * 60 * 60 * 24;

    let paginationFilter = "";

    if (query.continuation) {
      const contArr = splitContinuation(query.continuation, /^(.+)_(.+)_(\d+)_(\d+)$/);

      if (contArr.length !== 4) {
        throw Boom.badRequest("Invalid continuation string used");
      }

      (query as any).updatedAt = new Date(contArr[0]).toISOString();
      (query as any).txHash = toBuffer(contArr[1]);
      (query as any).logIndex = contArr[2];
      (query as any).batchIndex = contArr[3];
      paginationFilter = ` AND (updated_at, tx_hash, log_index, batch_index) > ($/updatedAt/, $/txHash/, $/logIndex/, $/batchIndex/)`;
    }

    try {
      const baseQuery = `
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
            fill_events_2.updated_at,
            fill_events_2.created_at
          FROM fill_events_2
            LEFT JOIN currencies
            ON fill_events_2.currency = currencies.contract
            WHERE updated_at < NOW() - INTERVAL '5 minutes'
            ${paginationFilter}
            ORDER BY fill_events_2.updated_at ASC, fill_events_2.tx_hash ASC, fill_events_2.log_index ASC, fill_events_2.batch_index ASC
          LIMIT ${LIMIT};
      `;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      const continuationToken = buildContinuation(
        rawResult[rawResult.length - 1].updated_at +
          "_" +
          fromBuffer(rawResult[rawResult.length - 1].tx_hash) +
          "_" +
          rawResult[rawResult.length - 1].log_index +
          "_" +
          rawResult[rawResult.length - 1].batch_index
      );
      const continuation = rawResult.length === LIMIT ? continuationToken : null;
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
          collectionId: r.collection_id,
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
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        });
      });

      const response = h.response({
        sales: await Promise.all(result),
        continuation,
        cursor: !continuation ? continuationToken : null,
      });

      if (rawResult.length === LIMIT) {
        response.ttl(CACHE_TTL);
      }
      return response;
    } catch (error) {
      logger.error(`sync-sales-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
