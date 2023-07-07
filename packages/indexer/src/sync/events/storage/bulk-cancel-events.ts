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
  minNonce: string;
  baseEventParams: BaseEventParams;
  orderSide?: "sell" | "buy";
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
  side: "sell" | "buy" | null;
};

function generateUpdateQuery(
  bulkCancelValues: DbEvent[],
  options?: {
    acrossAll?: boolean;
    withSide?: boolean;
  }
) {
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
      "side",
    ],
    { table: "bulk_cancel_events" }
  );

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
        "min_nonce",
        "side"
      ) VALUES ${pgp.helpers.values(bulkCancelValues, columns)}
      ON CONFLICT DO NOTHING
      RETURNING "side", "order_kind", "maker", "min_nonce", "tx_hash", "timestamp", "log_index", "batch_index", "block_hash"
    )
    UPDATE "orders" AS "o" SET
      "fillability_status" = 'cancelled',
      "expiration" = to_timestamp("x"."timestamp"),
      "updated_at" = now()
    FROM "x"
    WHERE "o"."maker" = "x"."maker"
      AND "o"."kind" = "x"."order_kind"
      ${options?.withSide ? ` AND "o"."side" = "x"."side"` : ""}
      ${options?.acrossAll ? "" : ` AND "o"."nonce" < "x"."min_nonce"`}
      AND ("o"."fillability_status" = 'fillable' OR "o"."fillability_status" = 'no-balance')
    RETURNING "o"."id", "x"."tx_hash", "x"."timestamp", "x"."log_index", "x"."batch_index", "x"."block_hash"
  `;
}

export const addEvents = async (events: Event[], backfill = false) => {
  const bulkCancelValues: DbEvent[] = [];
  const bulkCancelValuesAcrossAll: DbEvent[] = [];
  const bulkCancelValuesWithSide: DbEvent[] = [];
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
      side: event.orderSide ?? null,
    };

    if (event.acrossAll) {
      bulkCancelValuesAcrossAll.push(dbEvent);
    } else if (event.orderSide) {
      bulkCancelValuesWithSide.push(dbEvent);
    } else {
      bulkCancelValues.push(dbEvent);
    }
  }

  let query: string | undefined;
  if (bulkCancelValues.length) {
    query = generateUpdateQuery(bulkCancelValues);
  }

  let queryAcrossAll: string | undefined;
  if (bulkCancelValuesAcrossAll.length) {
    queryAcrossAll = generateUpdateQuery(bulkCancelValuesAcrossAll, { acrossAll: true });
  }

  let queryWithSide: string | undefined;
  if (bulkCancelValuesWithSide.length) {
    queryWithSide = generateUpdateQuery(bulkCancelValuesWithSide, { withSide: true });
  }

  if (query || queryAcrossAll || queryWithSide) {
    // No need to buffer through the write queue since there
    // are no chances of database deadlocks in this scenario
    const [result, resultAcrossAll, resultWithSide] = await Promise.all([
      query ? idb.manyOrNone(query) : Promise.resolve([]),
      queryAcrossAll ? idb.manyOrNone(queryAcrossAll) : Promise.resolve([]),
      queryWithSide ? idb.manyOrNone(queryWithSide) : Promise.resolve([]),
    ]);

    const all = result.concat(resultAcrossAll, resultWithSide);
    if (!backfill) {
      // TODO: Ideally, we should trigger all further processing
      // pipelines one layer higher but for now we can just have
      // it here. We should also run the order status updates in
      // a job queue (since we can potentially have an unbounded
      // number of orders that need status updates and executing
      // it synchronously is not ideal).
      await orderUpdatesByIdJob.addToQueue(
        all.map(
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
