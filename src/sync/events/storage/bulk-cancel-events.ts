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
  acrossAll?: boolean;
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

function generateUpdateQuery(bulkCancelValues: DbEvent[], acrossAll: boolean) {
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

  // For Element there has two kind-of nonce, set acrossAll `true` to cancel all maker's related orders
  // Atomically insert the bulk cancel events and update order statuses
  return `
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
      RETURNING "order_kind", "maker", "min_nonce", "tx_hash", "timestamp", "log_index", "batch_index", "block_hash"
    )
    UPDATE "orders" AS "o" SET
      "fillability_status" = 'cancelled',
      "expiration" = to_timestamp("x"."timestamp"),
      "updated_at" = now()
    FROM "x"
    WHERE "o"."maker" = "x"."maker"
      And "o"."kind" = "x"."order_kind"
      ${acrossAll ? `` : `AND "o"."nonce" < "x"."min_nonce" `}
      AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
    RETURNING "o"."id", "x"."tx_hash", "x"."timestamp", "x"."log_index", "x"."batch_index", "x"."block_hash"
  `;
}

export const addEvents = async (events: Event[], backfill = false) => {
  const bulkCancelValues: DbEvent[] = [];
  const bulkCancelValuesAcrossAll: DbEvent[] = [];
  for (const event of events) {
    const dbEvent = {
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
    };
    if (event.acrossAll) {
      bulkCancelValuesAcrossAll.push(dbEvent);
    } else {
      bulkCancelValues.push(dbEvent);
    }
  }

  let query: string | undefined;
  let acrossAllQuery: string | undefined;
  if (bulkCancelValues.length) {
    query = generateUpdateQuery(bulkCancelValues, false);
  }

  if (bulkCancelValuesAcrossAll.length) {
    acrossAllQuery = generateUpdateQuery(bulkCancelValuesAcrossAll, true);
  }

  if (query || acrossAllQuery) {
    // No need to buffer through the write queue since there
    // are no chances of database deadlocks in this scenario
    const [bulkResult, acrossResult] = await Promise.all([
      query ? idb.manyOrNone(query) : Promise.resolve([]),
      acrossAllQuery ? idb.manyOrNone(acrossAllQuery) : Promise.resolve([]),
    ]);

    const result = bulkResult.concat(acrossResult);

    if (!backfill) {
      // TODO: Ideally, we should trigger all further processing
      // pipelines one layer higher but for now we can just have
      // it here. We should also run the order status updates in
      // a job queue (since we can potentially have an unbounded
      // number of orders that need status updates and executing
      // it synchronously is not ideal).
      await orderUpdatesById.addToQueue(
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
            } as orderUpdatesById.OrderInfo)
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
      DELETE FROM bulk_cancel_events
      WHERE block = $/block/
        AND block_hash = $/blockHash/
    `,
    {
      block,
      blockHash: toBuffer(blockHash),
    }
  );
};
