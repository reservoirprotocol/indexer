import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { DbEvent, Event } from "@/events-sync/storage/cancel-events";

export const addEvents = async (events: Event[]) => {
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
        ON CONFLICT DO NOTHING
        RETURNING "order_kind", "order_id", "timestamp"
      )
      INSERT INTO "orders" (
        "id",
        "kind",
        "fillability_status",
        "expiration"
      ) (
        SELECT
          "x"."order_id",
          MIN("x"."order_kind"),
          'cancelled'::order_fillability_status_t,
          MIN(to_timestamp("x"."timestamp")) AS "expiration"
        FROM "x"
        GROUP BY "x"."order_id"
      )
      ON CONFLICT ("id") DO
      UPDATE SET
        "fillability_status" = 'cancelled',
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
  // Delete the cancel events but skip reverting order status updates
  // since it's not possible to know what to revert to and even if we
  // knew, it might mess up other higher-level order processes.
  await idb.any(
    `
      DELETE FROM cancel_events
      WHERE block = $/block/
        AND block_hash = $/blockHash/
    `,
    {
      block,
      blockHash: toBuffer(blockHash),
    }
  );
};
