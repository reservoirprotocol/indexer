import { ridb } from "@/common/db";
import { Sources } from "@/models/sources";
import { fromBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";

export class BidEventsDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `WHERE id > $/id/`;
    }

    const query = `
            SELECT
              bid_events.id,
              bid_events.kind,
              bid_events.status,
              bid_events.contract,
              bid_events.token_set_id,
              bid_events.order_id,
              bid_events.order_quantity_remaining,
              bid_events.maker,
              bid_events.price,
              bid_events.value,
              bid_events.order_source_id_int,
              coalesce(
                nullif(date_part('epoch', upper(bid_events.order_valid_between)), 'Infinity'),
                0
              ) AS valid_until,
              date_part('epoch', lower(bid_events.order_valid_between)) AS valid_from,
              bid_events.tx_hash,
              bid_events.tx_timestamp,
              extract(epoch from bid_events.created_at) AS created_at
            FROM bid_events
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

      const data = result.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        contract: fromBuffer(r.contract),
        token_set_id: r.token_set_id,
        order_id: r.order_id,
        maker: r.maker ? fromBuffer(r.maker) : null,
        price: r.price ? r.price.toString() : null,
        value: r.value ? r.value.toString() : null,
        quantity_remaining: Number(r.order_quantity_remaining),
        valid_from: r.valid_from ? Number(r.valid_from) : null,
        valid_until: r.valid_until ? Number(r.valid_until) : null,
        source: sources.get(r.order_source_id_int)?.name,
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
