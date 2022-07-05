import { redb } from "@/common/db";
import { formatEth, fromBuffer } from "@/common/utils";
import { BaseDataSource } from "@/jobs/data-export/data-sources/index";

export class CollectionsDataSource extends BaseDataSource {
  public async getSequenceData(cursor: CursorInfo | null, limit: number) {
    let continuationFilter = "";

    if (cursor) {
      continuationFilter = `WHERE (updated_at, id) > (to_timestamp($/updatedAt/), $/id/)`;
    }

    const query = `
        SELECT
          collections.id,
          collections.slug,
          collections.name,
          (collections.metadata ->> 'description')::TEXT AS "description",
          collections.contract,
          collections.token_count,
          collections.floor_sell_value,
          collections.day1_volume,
          collections.day7_volume,
          collections.day30_volume,
          collections.all_time_volume,
          collections.day1_rank,
          collections.day7_rank,
          collections.day30_rank,
          collections.all_time_rank,
          collections.day1_volume_change,
          collections.day7_volume_change,
          collections.day30_volume_change,
          collections.day1_floor_sell_value,
          collections.day7_floor_sell_value,
          collections.day30_floor_sell_value,
          collections.created_at,
          extract(epoch from collections.updated_at) updated_ts
        FROM collections
        ${continuationFilter}
        ORDER BY updated_at, id
        LIMIT $/limit/;  
      `;

    const result = await redb.manyOrNone(query, {
      id: cursor?.id,
      updatedAt: cursor?.updatedAt,
      limit,
    });

    if (result.length) {
      const data = result.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        token_count: String(r.token_count),
        contract: fromBuffer(r.contract),
        day1_rank: r.day1_rank,
        day7_rank: r.day7_rank,
        day30_rank: r.day30_rank,
        all_time_rank: r.all_time_rank,
        day1_volume: r.day1_volume ? formatEth(r.day1_volume) : null,
        day7_volume: r.day7_volume ? formatEth(r.day7_volume) : null,
        day30_volume: r.day30_volume ? formatEth(r.day30_volume) : null,
        all_time_volume: r.all_time_volume ? formatEth(r.all_time_volume) : null,
        day1_volume_change: r.day1_volume_change,
        day7_volume_change: r.day7_volume_change,
        day30_volume_change: r.day30_volume_change,
        floor_ask_value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
        day1_floor_ask_value: r.day1_floor_sell_value ? formatEth(r.day1_floor_sell_value) : null,
        day7_floor_ask_value: r.day7_floor_sell_value ? formatEth(r.day7_floor_sell_value) : null,
        day30_floor_ask_value: r.day30_floor_sell_value
          ? formatEth(r.day30_floor_sell_value)
          : null,
        day1_floor_ask_change: r.day1_floor_sell_value
          ? Number(r.floor_sell_value) / Number(r.day1_floor_sell_value)
          : null,
        day7_floor_ask_change: r.day7_floor_sell_value
          ? Number(r.floor_sell_value) / Number(r.day7_floor_sell_value)
          : null,
        day30_floor_ask_change: r.day30_floor_sell_value
          ? Number(r.floor_sell_value) / Number(r.day30_floor_sell_value)
          : null,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_ts).toISOString(),
      }));

      const lastResult = result[result.length - 1];

      return {
        data,
        nextCursor: {
          id: lastResult.id,
          updatedAt: lastResult.updated_ts,
        },
      };
    }

    return { data: [], nextCursor: null };
  }
}

type CursorInfo = {
  id: number;
  updatedAt: string;
};
