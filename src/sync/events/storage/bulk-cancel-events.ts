import { idb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { BaseEventParams } from "@/events-sync/parser";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";
import { OrderKind } from "@/orderbook/orders";

export type Event = {
  orderKind: OrderKind;
  maker: string;
  minNonce: string;
  baseEventParams: BaseEventParams;
};

type DbEvent = {
  address: Buffer;
  block: number;
  block_hash: Buffer;
  tx_hash: Buffer;
  tx_index: number;
  log_index: number;
  timestamp: number;
  batch_index: number;
  order_kind: OrderKind;
  maker: Buffer;
  min_nonce: string;
};

export const addEvents = async (events: Event[], backfill = false) => {
  const bulkCancelValues: DbEvent[] = [];
  for (const event of events) {
    bulkCancelValues.push({
      address: toBuffer(event.baseEventParams.address),
      block: event.baseEventParams.block,
      block_hash: toBuffer(event.baseEventParams.blockHash),
      tx_hash: toBuffer(event.baseEventParams.txHash),
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      batch_index: event.baseEventParams.batchIndex,
      order_kind: event.orderKind,
      maker: toBuffer(event.maker),
      min_nonce: event.minNonce,
    });
  }

  let query: string | undefined;
  if (bulkCancelValues.length) {
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
        "maker",
        "min_nonce",
      ],
      { table: "bulk_cancel_events" }
    );

    // Atomically insert the bulk cancel events and update order statuses
    query = `
      WITH "x" AS (
        INSERT INTO "bulk_cancel_events" (
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index",
          "timestamp",
          "batch_index",
          "order_kind",
          "maker",
          "min_nonce"
        ) VALUES ${pgp.helpers.values(bulkCancelValues, columns)}
        ON CONFLICT DO NOTHING
        RETURNING "order_kind", "maker", "min_nonce", "tx_hash", "timestamp"
      )
      UPDATE "orders" AS "o" SET
        "fillability_status" = 'cancelled',
        "expiration" = to_timestamp("x"."timestamp"),
        "updated_at" = now()
      FROM "x"
      WHERE "o"."kind" = "x"."order_kind"
        AND "o"."maker" = "x"."maker"
        AND "o"."nonce" < "x"."min_nonce"
        AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
      RETURNING "o"."id", "x"."tx_hash", "x"."timestamp"
    `;
  }

  if (query) {
    // No need to buffer through the write queue since there
    // are no chances of database deadlocks in this scenario
    const result = await idb.manyOrNone(query);

    if (!backfill) {
      // TODO: Ideally, we should trigger all further processing
      // pipelines one layer higher but for now we can just have
      // it here. We should also run the order status updates in
      // a job queue (since we can potentially have an unbounded
      // number of orders that need status updates and executing
      // it synchronously is not ideal).
      await orderUpdatesById.addToQueue(
        result.map(
          ({ id, tx_hash, timestamp }) =>
            ({
              context: `cancelled-${id}`,
              id,
              trigger: {
                kind: "cancel",
                txHash: fromBuffer(tx_hash),
                txTimestamp: timestamp,
              },
            } as orderUpdatesById.OrderInfo)
        )
      );
    }
  }
};

export const removeEvents = async (blockHash: string) => {
  // Delete the cancel events but skip reverting order status updates
  // since it's not possible to know what to revert to and even if we
  // knew, it might mess up other higher-level order processes.
  await idb.any(
    `DELETE FROM "bulk_cancel_events" WHERE "block_hash" = $/blockHash/`,
    {
      blockHash: toBuffer(blockHash),
    }
  );
};
