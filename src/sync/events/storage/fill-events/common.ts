import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { DbEvent, Event } from "@/events-sync/storage/fill-events";

export const addEvents = async (events: Event[]) => {
  const fillValues: DbEvent[] = [];
  const uniqueOrderIds = new Set<string>();

  for (const event of events) {
    if (event.orderId && !uniqueOrderIds.has(event.orderId)) {
      uniqueOrderIds.add(event.orderId);
    } else if (event.orderId && uniqueOrderIds.has(event.orderId)) {
      continue;
    }

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
        RETURNING "order_kind", "order_id", "timestamp", "order_source_id_int"
      )
      INSERT INTO "orders" (
        "id",
        "kind",
        "fillability_status",
        "expiration",
        "source_id_int"
      ) (
        SELECT
          "x"."order_id",
          "x"."order_kind",
          'filled'::order_fillability_status_t,
          to_timestamp("x"."timestamp") AS "expiration",
          "x"."order_source_id_int"
        FROM "x"
        WHERE "x"."order_id" IS NOT NULL
      )
      ON CONFLICT ("id") DO
      UPDATE SET
        "fillability_status" = 'filled',
        "expiration" = EXCLUDED."expiration",
        "updated_at" = now()
    `);
  }

  if (queries.length) {
    // No need to buffer through the write queue since there
    // are no chances of database deadlocks in this scenario
    await idb.none(pgp.helpers.concat(queries));
  }
};

export const removeEvents = async (block: number, blockHash: string) => {
  // Delete the fill events but skip reverting order status updates
  // since it is not possible to know what to revert to and even if
  // we knew, it might mess up other higher-level order processes.
  await idb.any(
    `
      DELETE FROM fill_events_2
      WHERE block = $/block/
        AND block_hash = $/blockHash/
    `,
    {
      block,
      blockHash: toBuffer(blockHash),
    }
  );
};
