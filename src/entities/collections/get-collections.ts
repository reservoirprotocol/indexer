import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetCollectionsFilter = {
  community?: string;
  name?: string;
  sortBy?: "id" | "floorCap";
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export type GetCollectionsResponse = {
  collection: {
    id: string;
    name: string;
    description: string;
    image: string;
    tokenSetId: string | null;
  };
  royalties: {
    recipient: string | null;
    bps: number;
  };
  set: {
    tokenCount: number;
    onSaleCount: number;
    sampleImages: string[];
    lastBuy: {
      value: number;
      block: number;
    } | null;
    market: {
      floorSell: {
        hash: string | null;
        value: number | null;
        maker: string | null;
        validFrom: number | null;
      };
      topBuy: {
        hash: string | null;
        value: number | null;
        maker: string | null;
        validFrom: number | null;
      };
    };
  };
}[];

export const getCollections = async (
  filter: GetCollectionsFilter
): Promise<GetCollectionsResponse> => {
  let baseQuery = `
    select
      "c"."id",
      "c"."name",
      "c"."description",
      "c"."image",
      "c"."royalty_bps",
      "c"."royalty_recipient",
      "c"."token_set_id",
      count("t"."token_id") as "token_count",
      count("t"."token_id") filter (where "t"."floor_sell_value" is not null) as "on_sale_count",
      array(
        select
          "t"."image"
        from "tokens" "t"
        where "t"."collection_id" = "c"."id"
          and "t"."image" is not null
        limit 4
      ) as "sample_images",
      (
        select
          json_build_object(
            'value', "ts"."last_buy_value"::text,
            'block', "ts"."last_buy_block"
          )
        from "token_sets" "ts"
        where "ts"."collection_id" = "c"."id"
          and "ts"."attribute_key" is null
          and "ts"."attribute_value" is null
        limit 1
      ) as "last_buy"
    from "collections" "c"
    join "tokens" "t"
      on "c"."id" = "t"."collection_id"
  `;

  // Filters
  const conditions: string[] = [];
  if (filter.community) {
    conditions.push(`"c"."community" = $/community/`);
  }
  if (filter.name) {
    filter.name = `%${filter.name}%`;
    conditions.push(`"c"."name" ilike $/name/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Grouping
  baseQuery += ` group by "c"."id"`;

  // Sorting
  const sortBy = filter.sortBy ?? "id";
  const sortDirection = filter.sortDirection ?? "asc";
  switch (sortBy) {
    case "id": {
      baseQuery += ` order by "c"."id" ${sortDirection} nulls last`;
      break;
    }

    case "floorCap": {
      baseQuery += ` order by count("t"."token_id") * min("t"."floor_sell_value") ${sortDirection} nulls last`;
      break;
    }
  }

  // Pagination
  baseQuery += ` offset $/offset/`;
  baseQuery += ` limit $/limit/`;

  baseQuery = `
    with "x" as (${baseQuery})
    select
      "x".*,
      "y".*,
      "z".*
    from "x"
    left join lateral (
      select
        "o"."hash" as "floor_sell_hash",
        "o"."value" as "floor_sell_value",
        "o"."maker" as "floor_sell_maker",
        date_part('epoch', lower("o"."valid_between")) as "floor_sell_valid_from"
      from "tokens" "t"
      join "orders" "o"
        on "t"."floor_sell_hash" = "o"."hash"
      where "t"."collection_id" = "x"."id"
      order by "t"."floor_sell_value" asc nulls last
      limit 1
    ) "y" on true
    left join lateral (
      select
        "o"."hash" as "top_buy_hash",
        "o"."value" as "top_buy_value",
        "o"."maker" as "top_buy_maker",
        date_part('epoch', lower("o"."valid_between")) as "top_buy_valid_from"
      from "token_sets" "ts"
      join "orders" "o"
        on "ts"."top_buy_hash" = "o"."hash"
      where "ts"."collection_id" = "x"."id"
        and "ts"."attribute_key" is null
        and "ts"."attribute_value" is null
      order by "ts"."top_buy_hash" asc nulls last
      limit 1
    ) "z" on true
  `;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      collection: {
        id: r.id,
        name: r.name,
        description: r.description,
        image: r.image,
        tokenSetId: r.token_set_id,
      },
      royalties: {
        recipient: r.royalty_recipient,
        bps: r.royalty_bps,
      },
      set: {
        tokenCount: Number(r.token_count),
        onSaleCount: Number(r.on_sale_count),
        lastBuy: r.last_buy?.value
          ? {
              value: formatEth(r.last_buy.value),
              block: Number(r.last_buy.block),
            }
          : null,
        sampleImages: r.sample_images || [],
        market: {
          floorSell: {
            hash: r.floor_sell_hash,
            value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
            maker: r.floor_sell_maker,
            validFrom: r.floor_sell_valid_from,
          },
          topBuy: {
            hash: r.top_buy_hash,
            value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
            maker: r.top_buy_maker,
            validFrom: r.top_buy_valid_from,
          },
        },
      },
    }))
  );
};
