import { redb } from "@/common/db";
import { Sources } from "@/models/sources";
import { formatEth, fromBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";

export class CollectionFloorAskEventsDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `WHERE id > $/id/`;
    }

    const query = `
            SELECT
              coalesce(
                nullif(date_part('epoch', upper(collection_floor_sell_events.order_valid_between)), 'Infinity'),
                0
              ) AS valid_until,
              collection_floor_sell_events.id,
              collection_floor_sell_events.kind,
              collection_floor_sell_events.collection_id,
              collection_floor_sell_events.contract,
              collection_floor_sell_events.token_id,
              collection_floor_sell_events.order_id,
              collection_floor_sell_events.order_source_id,
              collection_floor_sell_events.maker,
              collection_floor_sell_events.price,
              collection_floor_sell_events.previous_price,
              collection_floor_sell_events.tx_hash,
              collection_floor_sell_events.tx_timestamp,
              extract(epoch from collection_floor_sell_events.created_at) AS created_at
            FROM collection_floor_sell_events
            ${continuationFilter}
            ORDER BY id 
            LIMIT $/limit/;
      `;

    const result = await redb.manyOrNone(query, {
      id: cursor?.id,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();

      const data = result.map((r) => ({
        id: r.id,
        kind: r.kind,
        collection_id: r.collection_id,
        contract: fromBuffer(r.contract),
        token_id: r.token_id,
        order_id: r.order_id,
        maker: r.maker ? fromBuffer(r.maker) : null,
        price: r.price ? formatEth(r.price) : null,
        previous_price: r.previous_price ? formatEth(r.previous_price) : null,
        valid_until: r.valid_until ? Number(r.valid_until) : null,
        source: r.order_source_id
          ? sources.getByAddress(fromBuffer(r.order_source_id))?.name
          : null,
        tx_hash: r.tx_hash ? fromBuffer(r.tx_hash) : null,
        tx_timestamp: r.tx_timestamp ? Number(r.tx_timestamp) : null,
        created_at: new Date(r.created_at * 1000).toISOString(),
      }));

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
