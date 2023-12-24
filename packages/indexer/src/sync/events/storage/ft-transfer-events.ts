import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { BaseEventParams } from "@/events-sync/parser";
import { eventsSyncFtTransfersWriteBufferJob } from "@/jobs/events-sync/write-buffers/ft-transfers-job";

export type Event = {
  from: string;
  to: string;
  amount: string;
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
  from: Buffer;
  to: Buffer;
  amount: string;
};

export const addEvents = async (events: Event[], backfill: boolean) => {
  const transferValues: DbEvent[] = [];
  for (const event of events) {
    transferValues.push({
      address: toBuffer(event.baseEventParams.address),
      block: event.baseEventParams.block,
      block_hash: toBuffer(event.baseEventParams.blockHash),
      tx_hash: toBuffer(event.baseEventParams.txHash),
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      from: toBuffer(event.from),
      to: toBuffer(event.to),
      amount: event.amount,
    });
  }

  const queries: string[] = [];

  if (transferValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "tx_index",
        "log_index",
        "timestamp",
        "from",
        "to",
        "amount",
      ],
      { table: "ft_transfer_events" }
    );

    // Atomically insert the transfer events and update balances
    queries.push(`
      WITH "x" AS (
        INSERT INTO "ft_transfer_events" (
          "address",
          "block",
          "block_hash",
          "tx_hash",
          "tx_index",
          "log_index",
          "timestamp",
          "from",
          "to",
          "amount"
        ) VALUES ${pgp.helpers.values(transferValues, columns)}
        ON CONFLICT DO NOTHING
        RETURNING
          "address",
          ARRAY["from", "to"] AS "owners",
          ARRAY[-"amount", "amount"] AS "amount_deltas"
      )
      INSERT INTO "ft_balances" (
        "contract",
        "owner",
        "amount"
      ) (
        SELECT
          "y"."address",
          "y"."owner",
          SUM("y"."amount_delta")
        FROM (
          SELECT
            "address",
            unnest("owners") AS "owner",
            unnest("amount_deltas") AS "amount_delta"
          FROM "x"
          ORDER BY "address" ASC, "owner" ASC
        ) "y"
        GROUP BY "y"."address", "y"."owner"
      )
      ON CONFLICT ("contract", "owner") DO
      UPDATE SET "amount" = "ft_balances"."amount" + "excluded"."amount", updated_at = now()
    `);
  }

  if (queries.length) {
    if (backfill) {
      // When backfilling, use the write buffer to avoid deadlocks
      await eventsSyncFtTransfersWriteBufferJob.addToQueue({ query: pgp.helpers.concat(queries) });
    } else {
      // Otherwise write directly since there might be jobs that depend
      // on the events to have been written to the database at the time
      // they get to run and we have no way to easily enforce this when
      // using the write buffer.
      await idb.none(pgp.helpers.concat(queries));
    }
  }
};

export const removeEvents = async (block: number, blockHash: string) => {
  // Atomically delete the transfer events and revert balance updates
  await idb.any(
    `
      WITH "x" AS (
        DELETE FROM "ft_transfer_events"
        WHERE "block" = $/block/ AND "block_hash" = $/blockHash/
        RETURNING
          "address",
          ARRAY["from", "to"] AS "owners",
          ARRAY["amount", -"amount"] AS "amount_deltas"
      )
      INSERT INTO "ft_balances" (
        "contract",
        "owner",
        "amount"
      ) (
        SELECT
          "y"."address",
          "y"."owner",
          SUM("y"."amount_delta")
        FROM (
          SELECT
            "address",
            unnest("owners") AS "owner",
            unnest("amount_deltas") AS "amount_delta"
          FROM "x"
        ) "y"
        GROUP BY "y"."address", "y"."owner"
      )
      ON CONFLICT ("contract", "owner") DO
      UPDATE SET "amount" = "ft_balances"."amount" + "excluded"."amount", updated_at = now()
    `,
    {
      block,
      blockHash: toBuffer(blockHash),
    }
  );
};
