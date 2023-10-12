import { ridb } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";
import { Sources } from "@/models/sources";
import crypto from "crypto";
import { AddressZero } from "@ethersproject/constants";
import * as Sdk from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { getCurrency } from "@/utils/currencies";

export class SalesDataSourceV2 extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `AND (updated_at, tx_hash, log_index, batch_index) > (to_timestamp($/updatedAt/), $/txHash/, $/logIndex/, $/batchIndex/)`;
    }

    //Only get records that are older than 5 min to take removed blocks into consideration.
    const query = `
        SELECT
          contract,
          token_id,
          order_id,
          order_kind,
          order_side,
          order_source_id_int,
          maker,
          taker,
          amount,
          fill_source_id,
          aggregator_source_id,
          tx_hash,
          timestamp,
          currency,
          price,
          currency_price,
          usd_price,
          block,
          log_index,
          batch_index,
          wash_trading_score,
          is_primary,
          created_at,
          is_deleted,
          extract(epoch from updated_at) updated_ts
        FROM fill_events_2
        WHERE updated_at < NOW() - INTERVAL '5 minutes'
        ${continuationFilter}
        ORDER BY updated_at, tx_hash, log_index, batch_index
        LIMIT $/limit/;  
      `;

    const result = await ridb.manyOrNone(query, {
      updatedAt: cursor?.updatedAt,
      txHash: cursor?.txHash ? toBuffer(cursor.txHash) : null,
      logIndex: cursor?.logIndex,
      batchIndex: cursor?.batchIndex,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = [];

      for (const r of result) {
        const orderSource =
          r.order_source_id_int !== null ? sources.get(Number(r.order_source_id_int)) : null;

        const fillSource = r.fill_source_id !== null ? sources.get(Number(r.fill_source_id)) : null;

        const aggregatorSource =
          r.aggregator_source_id !== null ? sources.get(Number(r.aggregator_source_id)) : null;

        const currency = await getCurrency(
          fromBuffer(r.currency) === AddressZero
            ? r.order_side === "sell"
              ? Sdk.Common.Addresses.Native[config.chainId]
              : Sdk.Common.Addresses.WNative[config.chainId]
            : fromBuffer(r.currency)
        );

        const currencyPrice = r.currency_price ?? r.price;

        data.push({
          id: crypto
            .createHash("sha256")
            .update(`${fromBuffer(r.tx_hash)}${r.log_index}${r.batch_index}`)
            .digest("hex"),
          contract: fromBuffer(r.contract),
          token_id: r.token_id,
          order_id: r.order_id,
          order_kind: r.order_kind,
          order_side: r.order_side === "sell" ? "ask" : "bid",
          order_source: orderSource?.domain ?? null,
          from: r.order_side === "sell" ? fromBuffer(r.maker) : fromBuffer(r.taker),
          to: r.order_side === "sell" ? fromBuffer(r.taker) : fromBuffer(r.maker),
          price: r.price ? r.price.toString() : null,
          usd_price: r.usd_price,
          currency_address: currency.contract,
          currency_symbol: currency.symbol,
          currency_price: currencyPrice ? currencyPrice.toString() : null,
          amount: Number(r.amount),
          fill_source:
            fillSource?.domain ?? aggregatorSource?.domain ?? orderSource?.domain ?? null,
          aggregator_source: aggregatorSource?.domain ?? null,
          wash_trading_score: Number(r.wash_trading_score),
          is_primary: Boolean(r.is_primary),
          tx_hash: fromBuffer(r.tx_hash),
          tx_log_index: r.log_index,
          tx_batch_index: r.batch_index,
          tx_timestamp: r.timestamp,
          created_at: new Date(r.created_at).toISOString(),
          updated_at: new Date(r.updated_ts * 1000).toISOString(),
          is_deleted: Boolean(r.is_deleted),
        });
      }

      const lastResult = result[result.length - 1];

      return {
        data,
        nextCursor: {
          updatedAt: lastResult.updated_ts,
          txHash: fromBuffer(lastResult.tx_hash),
          logIndex: lastResult.log_index,
          batchIndex: lastResult.batch_index,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

type CursorInfo = {
  updatedAt: string;
  txHash: string;
  logIndex: number;
  batchIndex: string;
};
