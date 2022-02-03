import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";

export type GetStatsFilter = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  attributes?: { [key: string]: string };
};

export type GetStatsResponse = {
  tokenCount: number;
  onSaleCount: number;
  sampleImages: string[];
  market: {
    floorSell: {
      hash: string | null;
      value: number | null;
      maker: string | null;
      validFrom: number | null;
      token: {
        contract: string | null;
        tokenId: string | null;
        name: string | null;
        image: string | null;
      };
    };
    topBuy: {
      hash: string | null;
      value: number | null;
      maker: string | null;
      validFrom: number | null;
    };
  };
} | null;

export const getStats = async (
  filter: GetStatsFilter
): Promise<GetStatsResponse> => {
  // TODO: Improve query performance

  let baseQuery: string | undefined;
  if (filter.contract && filter.tokenId) {
    baseQuery = `
      select
        1 as "token_count",
        (case when "t"."floor_sell_hash" is not null
          then 1
          else 0
        end) as "on_sale_count",
        array["t"."image"] as "sample_images",
        "t"."floor_sell_hash",
        "t"."contract",
        "t"."token_id",
        "t"."name",
        "t"."image",
        "os"."value" as "floor_sell_value",
        "os"."maker" as "floor_sell_maker",
        date_part('epoch', lower("os"."valid_between")) as "floor_sell_valid_from",
        "t"."top_buy_hash",
        "ob"."value" as "top_buy_value",
        "ob"."maker" as "top_buy_maker",
        date_part('epoch', lower("ob"."valid_between")) as "top_buy_valid_from"
      from "tokens" "t"
      left join "orders" "os"
        on "t"."floor_sell_hash" = "os"."hash"
      left join "orders" "ob"
        on "t"."top_buy_hash" = "ob"."hash"
      where "t"."contract" = $/contract/
        and "t"."token_id" = $/tokenId/
    `;
  } else if (filter.collection && filter.attributes) {
    const aggConditions: string[] = [`"t"."collection_id" = $/collection/`];
    const sellConditions: string[] = [`"t"."collection_id" = $/collection/`];

    Object.entries(filter.attributes).forEach(([key, value], i) => {
      const condition = `
        exists(
          select from "attributes" "a"
          where "a"."contract" = "t"."contract"
            and "a"."token_id" = "t"."token_id"
            and "a"."key" = $/key${i}/
            and "a"."value" = $/value${i}/
        )
      `;
      aggConditions.push(condition);
      sellConditions.push(condition);

      (filter as any)[`key${i}`] = key;
      (filter as any)[`value${i}`] = value;
    });

    let aggQuery = `
      select
        "t"."collection_id",
        count("t"."token_id") as "token_count",
        count("t"."token_id") filter (where "t"."floor_sell_value" is not null) as "on_sale_count",
        (array_agg(distinct("t"."image")))[1:4] as "sample_images"
      from "tokens" "t"
    `;
    aggQuery += " where " + aggConditions.map((c) => `(${c})`).join(" and ");
    aggQuery += ` group by "t"."collection_id"`;

    let sellQuery = `
      select distinct on ("t"."collection_id")
        "t"."collection_id",
        "t"."floor_sell_hash",
        "t"."contract",
        "t"."token_id",
        "t"."name",
        "t"."image",
        "o"."value" as "floor_sell_value",
        "o"."maker" as "floor_sell_maker",
        date_part('epoch', lower("o"."valid_between")) as "floor_sell_valid_from",
        (case when "t"."floor_sell_hash" is not null
          then coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0)
          else null
        end) as "floor_sell_valid_until"
      from "tokens" "t"
      join "orders" "o"
        on "t"."floor_sell_hash" = "o"."hash"
    `;
    sellQuery += " where " + sellConditions.map((c) => `(${c})`).join(" and ");
    sellQuery += `
      order by "t"."collection_id", "t"."floor_sell_value" asc nulls last
      limit 1
    `;

    let buyQuery: string;
    if (Object.entries(filter.attributes).length === 1) {
      buyQuery = `
        select distinct on ("ts"."collection_id")
          "ts"."collection_id",
          "o"."hash" as "top_buy_hash",
          "o"."value" as "top_buy_value",
          "o"."maker" as "top_buy_maker",
          date_part('epoch', lower("o"."valid_between")) as "top_buy_valid_from",
          coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0) as "top_buy_valid_until"
        from "orders" "o"
        join "token_sets" "ts"
          on "o"."token_set_id" = "ts"."id"
        where "ts"."collection_id" = $/collection/
          and "ts"."attribute_key" = $/attributeKey/
          and "ts"."attribute_value" = $/attributeValue/
          and "o"."status" = 'valid'
          and "o"."side" = 'buy'
          and "o"."valid_between" @> now()
        order by "ts"."collection_id", "o"."value" desc nulls last
        limit 1
      `;

      const [attributeKey, attributeValue] = Object.entries(
        filter.attributes
      )[0];
      (filter as any).attributeKey = attributeKey;
      (filter as any).attributeValue = attributeValue;
    } else {
      // TODO: Support multiple attributes once integrated
      buyQuery = `
        select
          null as "collection_id",
          null as "top_buy_hash",
          null as "top_buy_value",
          null as "top_buy_maker",
          null as "top_buy_valid_from",
          null as "top_buy_valid_until"
      `;
    }

    baseQuery = `
      select
        "x".*,
        "y"."contract",
        "y"."token_id",
        "y"."name",
        "y"."image",
        "y"."floor_sell_hash",
        "y"."floor_sell_value",
        "y"."floor_sell_maker",
        "y"."floor_sell_valid_from",
        "y"."floor_sell_valid_until",
        "z"."top_buy_hash",
        "z"."top_buy_value",
        "z"."top_buy_maker",
        "z"."top_buy_valid_from",
        "z"."top_buy_valid_until"
      from (${aggQuery}) "x"
      left join (${sellQuery}) "y"
        on "x"."collection_id" = "y"."collection_id"
      left join (${buyQuery}) "z"
        on "x"."collection_id" = "z"."collection_id"
    `;
  } else if (filter.collection && !filter.attributes) {
    baseQuery = `
      select
        "x".*,
        "y"."contract",
        "y"."token_id",
        "y"."name",
        "y"."image",
        "y"."floor_sell_hash",
        "y"."floor_sell_value",
        "y"."floor_sell_maker",
        "y"."floor_sell_valid_from",
        "y"."floor_sell_valid_until",
        "z"."top_buy_hash",
        "z"."top_buy_value",
        "z"."top_buy_maker",
        "z"."top_buy_valid_from",
        "z"."top_buy_valid_until"
      from (
        select
          "t"."collection_id",
          count("t"."token_id") as "token_count",
          count("t"."token_id") filter (where "t"."floor_sell_hash" is not null) as "on_sale_count",
          (array_agg(distinct("t"."image")))[1:4] as "sample_images"
        from "tokens" "t"
        where "t"."collection_id" = $/collection/
        group by "t"."collection_id"
      ) "x"
      left join (
        select distinct on ("t"."collection_id")
          "t"."collection_id",
          "t"."floor_sell_hash",
          "t"."contract",
          "t"."token_id",
          "t"."name",
          "t"."image",
          "o"."value" as "floor_sell_value",
          "o"."maker" as "floor_sell_maker",
          date_part('epoch', lower("o"."valid_between")) as "floor_sell_valid_from",
          (case when "t"."floor_sell_hash" is not null
            then coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0)
            else null
          end) as "floor_sell_valid_until"
        from "tokens" "t"
        join "orders" "o"
          on "t"."floor_sell_hash" = "o"."hash"
        where "t"."collection_id" = $/collection/
        order by "t"."collection_id", "t"."floor_sell_value" asc nulls last
      ) "y"
        on "x"."collection_id" = "y"."collection_id"
      left join (
        select distinct on ("ts"."collection_id")
          "ts"."collection_id",
          "o"."hash" as "top_buy_hash",
          "o"."value" as "top_buy_value",
          "o"."maker" as "top_buy_maker",
          date_part('epoch', lower("o"."valid_between")) as "top_buy_valid_from",
          (case when "o"."hash" is not null
            then coalesce(nullif(date_part('epoch', upper("o"."valid_between")), 'Infinity'), 0)
            else null
          end) as "top_buy_valid_until"
        from "orders" "o"
        join "token_sets" "ts"
          on "o"."token_set_id" = "ts"."id"
        where "ts"."collection_id" = $/collection/
          and "ts"."attribute_key" is null
          and "o"."side" = 'buy'
          and "o"."status" = 'valid'
          and "o"."valid_between" @> now()
        order by "ts"."collection_id", "o"."value" desc nulls last
      ) "z"
        on "x"."collection_id" = "z"."collection_id"
    `;
  }

  if (baseQuery) {
    const r = await db.oneOrNone(baseQuery, filter);
    if (r) {
      return {
        tokenCount: Number(r.token_count),
        onSaleCount: Number(r.on_sale_count),
        sampleImages: r.sample_images || [],
        market: {
          floorSell: {
            hash: r.floor_sell_hash || null,
            value: r.floor_sell_value ? formatEth(r.floor_sell_value) : null,
            maker: r.floor_sell_maker || null,
            validFrom: r.floor_sell_valid_from || null,
            token: {
              contract: r.contract || null,
              tokenId: r.token_id || null,
              name: r.name || null,
              image: r.image || null,
            },
          },
          topBuy: {
            hash: r.top_buy_hash || null,
            value: r.top_buy_value ? formatEth(r.top_buy_value) : null,
            maker: r.top_buy_maker || null,
            validFrom: r.top_buy_valid_from || null,
          },
        },
      };
    }
  }

  // Default empty response
  return {
    tokenCount: 0,
    onSaleCount: 0,
    sampleImages: [],
    market: {
      floorSell: {
        hash: null,
        value: null,
        maker: null,
        validFrom: null,
        token: {
          contract: null,
          tokenId: null,
          name: null,
          image: null,
        },
      },
      topBuy: {
        hash: null,
        value: null,
        maker: null,
        validFrom: null,
      },
    },
  };
};
