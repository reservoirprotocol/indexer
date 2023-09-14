import { idb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { BaseEventParams } from "@/events-sync/parser";
import { OrderKind } from "@/orderbook/orders";
import {
  orderUpdatesByIdJob,
  OrderUpdatesByIdJobPayload,
} from "@/jobs/order-updates/order-updates-by-id-job";

export type Event = {
  orderKind: OrderKind;
  maker: string;
  nonce: string;
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
  nonce: string;
};

export const addEvents = async (events: Event[], backfill = false) => {
  const nonceCancelValues: DbEvent[] = [];
  for (const event of events) {
    nonceCancelValues.push({
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
      nonce: event.nonce,
    });
  }

  let query: string | undefined;
  if (nonceCancelValues.length) {
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
        "nonce",
      ],
      { table: "nonce_cancel_events" }
    );

    // Atomically insert the nonce cancel events and update order statuses.
    query = `
      WITH "x" AS (
        INSERT INTO "nonce_cancel_events" (
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
          "nonce"
        ) VALUES ${pgp.helpers.values(nonceCancelValues, columns)}
        ON CONFLICT DO NOTHING
        RETURNING "order_kind", "maker", "nonce", "tx_hash", "timestamp", "log_index", "batch_index", "block_hash"
      )
      UPDATE "orders" AS "o" SET
        "fillability_status" = 'cancelled',
        "expiration" = to_timestamp("x"."timestamp"),
        "updated_at" = now()
      FROM "x"
      WHERE "o"."kind" = "x"."order_kind"
        AND "o"."maker" = "x"."maker"
        AND "o"."nonce" = "x"."nonce"
        AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
      RETURNING "o"."id", "x"."tx_hash", "x"."timestamp", "x"."log_index", "x"."batch_index", "x"."block_hash"
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
      await orderUpdatesByIdJob.addToQueue(
        result.map(
          ({ id, tx_hash, timestamp, log_index, batch_index, block_hash }) =>
            ({
              context: `cancelled-${id}`,
              id,
              trigger: {
                kind: "cancel",
                txHash: fromBuffer(tx_hash),
                txTimestamp: timestamp,
                logIndex: log_index,
                batchIndex: batch_index,
                blockHash: fromBuffer(block_hash),
              },
            } as OrderUpdatesByIdJobPayload)
        )
      );
    }
  }
};

export const removeEvents = async (block: number, blockHash: string) => {
  // Delete the cancel events but skip reverting order status updates
  // since it's not possible to know what to revert to and even if we
  // knew, it might mess up other higher-level order processes.
  await idb.any(
    `
      DELETE FROM nonce_cancel_events
      WHERE block = $/block/
        AND block_hash = $/blockHash/
    `,
    {
      block,
      blockHash: toBuffer(blockHash),
    }
  );
};
