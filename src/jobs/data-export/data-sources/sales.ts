import { redb } from "@/common/db";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";
import { Sources } from "@/models/sources";

export class SalesDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `AND (created_at, tx_hash, log_index, batch_index) > (to_timestamp($/createdAt/), $/txHash/, $/logIndex/, $/batchIndex/)`;
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
          fill_source,
          tx_hash,
          timestamp,
          price,
          block,
          log_index,
          batch_index,
          extract(epoch from created_at) created_ts
        FROM fill_events_2
        WHERE created_at < NOW() - INTERVAL '5 minutes'
        ${continuationFilter}
        ORDER BY created_at, tx_hash, log_index, batch_index
        LIMIT $/limit/;  
      `;

    const result = await redb.manyOrNone(query, {
      createdAt: cursor?.createdAt,
      txHash: cursor?.txHash ? toBuffer(cursor.txHash) : null,
      logIndex: cursor?.logIndex,
      batchIndex: cursor?.batchIndex,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = result.map((r) => {
        const orderSource = r.order_source_id_int ? sources.get(r.order_source_id_int)?.name : null;

        return {
          contract: fromBuffer(r.contract),
          token_id: r.token_id,
          order_id: r.order_id,
          order_kind: r.order_kind,
          order_side: r.order_side === "sell" ? "ask" : "bid",
          order_source: orderSource,
          from: r.order_side === "sell" ? fromBuffer(r.maker) : fromBuffer(r.taker),
          to: r.order_side === "sell" ? fromBuffer(r.taker) : fromBuffer(r.maker),
          price: r.price ? formatEth(r.price) : null,
          amount: Number(r.amount),
          fill_source: r.fill_source ? String(r.fill_source) : orderSource,
          tx_hash: r.tx_hash ? fromBuffer(r.tx_hash) : null,
          tx_log_index: r.log_index,
          tx_batch_index: r.batch_index,
          tx_timestamp: r.timestamp,
          created_at: new Date(r.created_ts).toISOString(),
        };
      });

      const lastResult = result[result.length - 1];

      return {
        data,
        nextCursor: {
          createdAt: lastResult.created_ts,
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
  createdAt: string;
  txHash: string;
  logIndex: number;
  batchIndex: string;
};
