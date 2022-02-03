import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetCollectionAttributesFilter = {
  collection: string;
  attribute?: string;
  sortBy?: "value" | "floorSellValue" | "floorCap" | "topBuyValue";
  sortDirection?: "asc" | "desc";
  offset: number;
  limit: number;
};

export type GetCollectionAttributesResponse = {
  key: string;
  value: string;
  tokenCount: number;
  onSaleCount: number;
  sampleImages: string[];
  lastSells: {
    value: number;
    block: number;
  }[];
  lastBuys: {
    value: number;
    block: number;
  }[];
  floorSellValues: number[];
  topBuy: {
    hash: string | null;
    value: number | null;
    maker: string | null;
    validFrom: number | null;
  };
}[];

export const getCollectionAttributes = async (
  filter: GetCollectionAttributesFilter
): Promise<GetCollectionAttributesResponse> => {
  let baseQuery = `
    select
      "a"."collection_id",
      "a"."key",
      "a"."value",
      count(distinct("t"."token_id")) as "token_count",
      count(distinct("t"."token_id")) filter (where "t"."floor_sell_value" is not null) as "on_sale_count",
      min("t"."floor_sell_value") as "floor_sell_value",
      max("ts"."top_buy_value") as "top_buy_value",
      (array_agg(distinct("t"."image")))[1:4] as "sample_images",
      ((array_agg(
        "t"."floor_sell_value" order by "t"."floor_sell_value" asc
      ) filter (where "t"."floor_sell_value" is not null))::text[])[1:21] as "floor_sell_values",
      ((array_agg(
        json_build_object(
          'value', "t"."last_sell_value"::text,
          'block', "t"."last_sell_block"
        ) order by "t"."last_sell_block" desc
      ) filter (where "t"."last_sell_value" is not null))::json[])[1:11] as "last_sells",
      ((array_agg(
        json_build_object(
          'value', "ts"."last_buy_value"::text,
          'block', "ts"."last_buy_block"
        )
      ) filter (where "ts"."last_buy_value" is not null))::json[])[1:11] as "last_buys"
    from "attributes" "a"
    join "tokens" "t"
      on "a"."contract" = "t"."contract"
      and "a"."token_id" = "t"."token_id"
    left join "token_sets" "ts"
      on "ts"."collection_id" = "a"."collection_id"
      and "ts"."attribute_key" = "a"."key"
      and "ts"."attribute_value" = "a"."value"
  `;

  // Filters
  const conditions: string[] = [
    `"a"."collection_id" = $/collection/`,
    `"a"."rank" is not null`,
    `"a"."kind" = 'string' or "a"."kind" = 'number'`,
  ];
  if (filter.attribute) {
    conditions.push(`"a"."key" = $/attribute/`);
  }
  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Grouping
  baseQuery += ` group by "a"."collection_id", "a"."key", "a"."value"`;

  // Sorting
  const sortBy = filter.sortBy ?? "default";
  const sortDirection = filter.sortDirection ?? "asc";
  switch (sortBy) {
    case "default": {
      baseQuery += `
        order by
          max("ts"."top_buy_value") desc nulls last,
          min("t"."floor_sell_value") desc nulls last
      `;
      break;
    }

    case "value": {
      // TODO: Properly integrate sorting by attribute rank and kind
      baseQuery += `
        order by
          "a"."key",
          "a"."value" ${sortDirection} nulls last
        `;
      break;
    }

    case "floorSellValue": {
      baseQuery += ` order by min("t"."floor_sell_value") ${sortDirection} nulls last`;
      break;
    }

    case "floorCap": {
      baseQuery += ` order by min("t"."floor_sell_value") * count(distinct("a"."token_id")) ${sortDirection} nulls last`;
      break;
    }

    case "topBuyValue": {
      baseQuery += ` order by max("ts"."top_buy_value") ${sortDirection} nulls last`;
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
      "y".*
    from "x"
    left join lateral (
      select
        "o"."hash" as "top_buy_hash",
        "o"."value" as "top_buy_value",
        "o"."maker" as "top_buy_maker",
        date_part('epoch', lower("o"."valid_between")) as "top_buy_valid_from"
      from "token_sets" "ts"
      join "orders" "o"
        on "ts"."top_buy_hash" = "o"."hash"
      where "ts"."collection_id" = "x"."collection_id"
        and "ts"."attribute_key" = "x"."key"
        and "ts"."attribute_value" = "x"."value"
      order by "ts"."top_buy_hash" asc nulls last
      limit 1
    ) "y" on true
  `;

  return db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      key: r.key,
      value: r.value,
      tokenCount: Number(r.token_count),
      onSaleCount: Number(r.on_sale_count),
      sampleImages: r.sample_images || [],
      lastSells: (r.last_sells || []).map(({ value, block }: any) => ({
        value: formatEth(value),
        block: Number(block),
      })),
      lastBuys: (r.last_buys || []).map(({ value, block }: any) => ({
        value: formatEth(value),
        block: Number(block),
      })),
      floorSellValues: (r.floor_sell_values || []).map(formatEth),
      topBuy: {
        hash: r.top_buy_hash,
        value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
        maker: r.top_buy_maker,
        validFrom: r.top_buy_valid_from,
      },
    }))
  );
};
