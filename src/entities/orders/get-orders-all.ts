import { formatEth } from "@/common/bignumber";
import { db } from "@/common/db";
import PgPromise from "pg-promise";

export type GetOrdersAllFilter = {
  side?: "sell" | "buy";
  sortDirection: "asc" | "desc";
  continuation?: string;
  limit: number;
  startTime?: number;
  endTime?: number;
};

export type GetOrdersAllResponse = {
  orders: {
    hash: string;
    tokenSetId: string;
    schema: any;
    metadata: any;
    kind: string;
    side: string;
    maker: string;
    price: number;
    value: number;
    validFrom: number;
    validUntil: number;
    sourceInfo: any;
    royaltyInfo: any;
    createdAt: string;
    rawData: any;
  }[];
  continuation: string | null;
};

export const getOrdersAll = async (
  filter: GetOrdersAllFilter
): Promise<GetOrdersAllResponse> => {
  let baseQuery = `
    select
      "o"."hash",
      "o"."token_set_id",
      "ts"."label" as "schema",
      "ts"."metadata" as "metadata",
      "o"."kind",
      "o"."side",
      "o"."maker",
      "o"."price",
      "o"."value",
      date_part('epoch', date_trunc('seconds', lower("o"."valid_between"))) as "valid_from",
      coalesce(nullif(date_part('epoch', date_trunc('seconds', upper("o"."valid_between"))), 'Infinity'), 0) as "valid_until",
      "o"."source_info",
      "o"."royalty_info",
      "o"."created_at",
      "o"."raw_data"
    from "orders" "o"
    join "token_sets" "ts"
      on "o"."token_set_id" = "ts"."id"
  `;

  // Filters
  const conditions: string[] = [`"o"."status" = 'valid'`];
  if (filter.side) {
    conditions.push(`"o"."side" = $/side/`);
  }
  if (filter.continuation) {
    const [createdAt, hash] = filter.continuation.split("_");
    (filter as any).createdAt = createdAt;
    (filter as any).hash = hash;

    conditions.push(
      `("o"."created_at", "o"."hash") ${
        filter.sortDirection === "asc" ? ">" : "<"
      } (to_timestamp($/createdAt/ / 1000.0), $/hash/)`
    );
  }

  if (filter.startTime) {
    conditions.push(`"o"."created_at" >= $/startTime/`);
  }

  if (filter.endTime) {
    conditions.push(`"o"."created_at" <= $/endTime/`);
  }

  if (conditions.length) {
    baseQuery += " where " + conditions.map((c) => `(${c})`).join(" and ");
  }

  // Sorting
  baseQuery += `
    order by
      "o"."created_at" ${filter.sortDirection},
      "o"."hash" ${filter.sortDirection}
    `;

  // Pagination
  baseQuery += ` limit $/limit/`;

  const query = PgPromise.as.format(baseQuery, filter);
  console.log(query);

  const orders = await db.manyOrNone(baseQuery, filter).then((result) =>
    result.map((r) => ({
      hash: r.hash,
      tokenSetId: r.token_set_id,
      schema: r.schema,
      metadata: r.metadata || null,
      kind: r.kind,
      side: r.side,
      maker: r.maker,
      price: formatEth(r.price),
      value: formatEth(r.value),
      validFrom: Number(r.valid_from),
      validUntil: Number(r.valid_until),
      sourceInfo: r.source_info,
      royaltyInfo: r.royalty_info,
      createdAt: new Date(r.created_at).toISOString(),
      rawData: r.raw_data,
    }))
  );


  let continuation = null;
  if (orders.length === filter.limit) {
    continuation =
      new Date(orders[orders.length - 1].createdAt).getTime() +
      "_" +
      orders[orders.length - 1].hash;
  }

  return { orders, continuation };
};
