import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { BaseEventParams } from "@/events-sync/parser";

export type Event = {
  owner: string;
  operator: string;
  approved: boolean;
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
  owner: Buffer;
  operator: Buffer;
  approved: boolean;
};

export const addEvents = async (events: Event[]) => {
  const approvalValues: DbEvent[] = [];
  for (const event of events) {
    approvalValues.push({
      address: toBuffer(event.baseEventParams.address),
      block: event.baseEventParams.block,
      block_hash: toBuffer(event.baseEventParams.blockHash),
      tx_hash: toBuffer(event.baseEventParams.txHash),
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      batch_index: event.baseEventParams.batchIndex,
      owner: toBuffer(event.owner),
      operator: toBuffer(event.operator),
      approved: event.approved,
    });
  }

  let query: string | undefined;
  if (approvalValues.length) {
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
        "owner",
        "operator",
        "approved",
      ],
      { table: "nft_approval_events" }
    );

    query = `
      INSERT INTO "nft_approval_events" (
        "address",
        "block",
        "block_hash",
        "tx_hash",
        "tx_index",
        "log_index",
        "timestamp",
        "batch_index",
        "owner",
        "operator",
        "approved"
      ) VALUES ${pgp.helpers.values(approvalValues, columns)}
      ON CONFLICT DO NOTHING
    `;
  }

  if (query) {
    // No need to buffer through the write queue since there
    // are no chances of database deadlocks in this scenario
    await idb.none(query);
  }
};

export const removeEvents = async (blockHash: string) => {
  // Delete the approval events but skip reverting order status updates
  // since it might mess up other higher-level order processes.
  await idb.any(
    `DELETE FROM "nft_approval_events" WHERE "block_hash" = $/blockHash/`,
    {
      blockHash: toBuffer(blockHash),
    }
  );
};
