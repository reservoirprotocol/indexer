import { ridb } from "@/common/db";
import { Sources } from "@/models/sources";
import { fromBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";

export class CollectionTopBidEventsDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `WHERE id > $/id/`;
    }

    const query = `
            SELECT
              coalesce(
                nullif(date_part('epoch', upper(collection_top_bid_events.order_valid_between)), 'Infinity'),
                0
              ) AS valid_until,
              collection_top_bid_events.id,
              collection_top_bid_events.kind,
              collection_top_bid_events.collection_id,
              collection_top_bid_events.contract,
              collection_top_bid_events.token_set_id,
              collection_top_bid_events.order_id,
              collection_top_bid_events.order_source_id_int,
              collection_top_bid_events.maker,
              collection_top_bid_events.price,
              collection_top_bid_events.previous_price,
              collection_top_bid_events.tx_hash,
              collection_top_bid_events.tx_timestamp,
              extract(epoch from collection_top_bid_events.created_at) AS created_at
            FROM collection_top_bid_events
            ${continuationFilter}
            ORDER BY id 
            LIMIT $/limit/;
      `;

    const result = await ridb.manyOrNone(query, {
      id: cursor?.id,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = result.map((r) => {
        const source = sources.get(r.order_source_id_int);
        return {
          id: r.id,
          kind: r.kind,
          collection_id: r.collection_id,
          contract: r.contract ? fromBuffer(r.contract) : null,
          token_set_id: r.token_set_id,
          order_id: r.order_id,
          maker: r.maker ? fromBuffer(r.maker) : null,
          price: r.price ? r.price.toString() : null,
          previous_price: r.previous_price ? r.previous_price.toString() : null,
          valid_until: r.valid_until ? Number(r.valid_until) : null,
          source: source ? source.name : null,
          tx_hash: r.tx_hash ? fromBuffer(r.tx_hash) : null,
          tx_timestamp: r.tx_timestamp ? Number(r.tx_timestamp) : null,
          created_at: new Date(r.created_at * 1000).toISOString(),
        };
      });

      const lastResult = result[result.length - 1];

      return {
        data,
        nextCursor: { id: lastResult.id },
      };
    }

    return { data: [], nextCursor: null };
  }
}

type CursorInfo = {
  id: number;
};
