import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { DbEvent, Event } from "@/events-sync/storage/fill-events";

export const addEventsOnChain = async (events: Event[]) => {
  const fillValues: DbEvent[] = [];
  for (const event of events) {
    fillValues.push({
      address: toBuffer(event.baseEventParams.address),
      block: event.baseEventParams.block,
      block_hash: toBuffer(event.baseEventParams.blockHash),
      tx_hash: toBuffer(event.baseEventParams.txHash),
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      batch_index: event.baseEventParams.batchIndex,
      order_kind: event.orderKind,
      order_id: event.orderId || null,
      order_side: event.orderSide,
      order_source_id_int: event.orderSourceId || null,
      maker: toBuffer(event.maker),
      taker: toBuffer(event.taker),
      price: event.price,
      contract: toBuffer(event.contract),
      token_id: event.tokenId,
      amount: event.amount,
      aggregator_source_id: event.aggregatorSourceId || null,
      fill_source_id: event.fillSourceId || null,
      wash_trading_score: event.washTradingScore || 0,
      currency: toBuffer(event.currency),
      currency_price: event.currencyPrice || null,
      usd_price: event.usdPrice || null,
      is_primary: event.isPrimary || null,
    });
  }

  const queries: string[] = [];

  if (fillValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "tx_index",
        "log_index",
        "timestamp",
        "batch_index",
        "order_kind",
        "order_id",
        "order_side",
        "order_source_id_int",
        "maker",
        "taker",
        "price",
        "contract",
        "token_id",
        "amount",
        "aggregator_source_id",
        "fill_source_id",
        "wash_trading_score",
        "currency",
        "currency_price",
        "usd_price",
        "is_primary",
      ],
      { table: "fill_events_2" }
    );

    // Atomically insert the fill events and update order statuses
    queries.push(`
      WITH "x" AS (
        INSERT INTO "fill_events_2" (
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index",
          "timestamp",
          "batch_index",
          "order_kind",
          "order_id",
          "order_side",
          "order_source_id_int",
          "maker",
          "taker",
          "price",
          "contract",
          "token_id",
          "amount",
          "aggregator_source_id",
          "fill_source_id",
          "wash_trading_score",
          "currency",
          "currency_price",
          "usd_price",
          "is_primary"
        ) VALUES ${pgp.helpers.values(fillValues, columns)}
        ON CONFLICT DO NOTHING
        RETURNING "order_kind", "order_id", "timestamp"
      )
      UPDATE "orders" SET
        "fillability_status" = 'filled',
        "expiration" = to_timestamp("x"."timestamp"),
        "updated_at" = now()
      FROM "x"
      WHERE "orders"."id" = "x"."order_id"
        AND lower("orders"."valid_between") < to_timestamp("x"."timestamp")
    `);
  }

  if (queries.length) {
    // No need to buffer through the write queue since there
    // are no chances of database deadlocks in this scenario
    await idb.none(pgp.helpers.concat(queries));
  }
};
