import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { DbEvent, Event } from "@/events-sync/storage/cancel-events";

export const addEventsOnChain = async (events: Event[]) => {
  const cancelValues: DbEvent[] = [];
  for (const event of events) {
    cancelValues.push({
      address: toBuffer(event.baseEventParams.address),
      block: event.baseEventParams.block,
      block_hash: toBuffer(event.baseEventParams.blockHash),
      tx_hash: toBuffer(event.baseEventParams.txHash),
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      order_kind: event.orderKind,
      order_id: event.orderId,
    });
  }

  const queries: string[] = [];

  if (cancelValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "tx_index",
        "log_index",
        "timestamp",
        "order_kind",
        "order_id",
      ],
      { table: "cancel_events" }
    );

    // Atomically insert the cancel events and update order statuses
    // NOTE: Ideally we have an `ON CONFLICT NO NOTHING` clause, but
    // in order to be able to sync sales/cancels before orders we do
    // a redundant update (so that the update on the orders table is
    // triggered)
    queries.push(`
      WITH "x" AS (
        INSERT INTO "cancel_events" (
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index",
          "timestamp",
          "order_kind",
          "order_id"
        ) VALUES ${pgp.helpers.values(cancelValues, columns)}
        ON CONFLICT ("block_hash", "tx_hash", "log_index") DO UPDATE
          SET "order_id" = EXCLUDED.order_id
        RETURNING "order_kind", "order_id", "timestamp", "block", "log_index"
      )
      UPDATE "orders" SET
        "fillability_status" = 'cancelled',
        "expiration" = to_timestamp("x"."timestamp"),
        "updated_at" = now()
      FROM "x"
      WHERE "orders"."id" = "x"."order_id"
        AND (
          lower("orders"."valid_between"),
          coalesce("orders"."block_number", 0),
          coalesce("orders"."log_index", 0)
        ) < (
          to_timestamp("x"."timestamp"),
          "x"."block",
          "x"."log_index"
        )
    `);
  }

  if (queries.length) {
    // No need to buffer through the write queue since there
    // are no chances of database deadlocks in this scenario
    await idb.none(pgp.helpers.concat(queries));
  }
};
