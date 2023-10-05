import { ridb } from "@/common/db";
import { Sources } from "@/models/sources";
import { fromBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";

export class TokenFloorAskEventsDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `WHERE id > $/id/`;
    }

    const query = `
      SELECT
        token_floor_sell_events.source_id_int,
        date_part('epoch', lower(token_floor_sell_events.valid_between)) AS valid_from,
        coalesce(
          nullif(date_part('epoch', upper(token_floor_sell_events.valid_between)), 'Infinity'),
          0
        ) AS valid_until,
        token_floor_sell_events.nonce,
        token_floor_sell_events.id,
        token_floor_sell_events.kind,
        token_floor_sell_events.contract,
        token_floor_sell_events.token_id,
        token_floor_sell_events.order_id,
        token_floor_sell_events.maker,
        token_floor_sell_events.price,
        token_floor_sell_events.previous_price,
        token_floor_sell_events.tx_hash,
        token_floor_sell_events.tx_timestamp,
        extract(epoch from token_floor_sell_events.created_at) AS created_at
      FROM token_floor_sell_events
      ${continuationFilter}
      ORDER BY id 
      LIMIT $/limit/
  `;

    const result = await ridb.manyOrNone(query, {
      id: cursor?.id,
      limit,
    });

    if (result.length) {
      const sources = await Sources.getInstance();
      const data = result.map((r) => {
        const source = sources.get(r.source_id_int);
        return {
          id: r.id,
          kind: r.kind,
          contract: fromBuffer(r.contract),
          token_id: r.token_id,
          order_id: r.order_id,
          maker: r.maker ? fromBuffer(r.maker) : null,
          price: r.price ? r.price.toString() : null,
          previous_price: r.previous_price ? r.previous_price.toString() : null,
          nonce: r.nonce,
          valid_from: r.valid_from ? Number(r.valid_from) : null,
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
        nextCursor: {
          id: lastResult.id,
          updatedAt: lastResult.updated_at,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

type CursorInfo = {
  id: number;
};
