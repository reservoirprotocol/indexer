import { idb, pgp } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { BaseEventParams } from "@/events-sync/parser";
import * as nftTransfersWriteBuffer from "@/jobs/events-sync/write-buffers/nft-transfers";
import _ from "lodash";
import { logger } from "@/common/logger";

export type Event = {
  kind: "erc721" | "erc1155" | "cryptopunks" | "cryptokitties";
  from: string;
  to: string;
  tokenId: string;
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
  batch_index: number;
  from: Buffer;
  to: Buffer;
  token_id: string;
  amount: string;
};

export const addEvents = async (events: Event[], backfill: boolean) => {
  // Keep track of all unique contracts and tokens
  const uniqueContracts = new Set<string>();
  const uniqueTokens = new Set<string>();
  const uniqueOwners = new Set<string>();

  let transferValues: DbEvent[] = [];
  const uniqueOwnersTransferValues = [];

  const contractValues: {
    address: Buffer;
    kind: "erc721" | "erc1155" | "cryptopunks" | "cryptokitties";
  }[] = [];

  const tokenValues: {
    collection_id: string;
    contract: Buffer;
    token_id: string;
    minted_timestamp: number;
  }[] = [];

  for (const event of events) {
    const contractId = event.baseEventParams.address.toString();

    const ownerFrom = `${event.from}:${contractId}:${event.tokenId}`;
    const ownerTo = `${event.to}:${contractId}:${event.tokenId}`;

    // Once we already update an owner create new array in order to split the update queries later
    if (_.size(transferValues) >= 50 || uniqueOwners.has(ownerFrom) || uniqueOwners.has(ownerTo)) {
      uniqueOwnersTransferValues.push(transferValues);
      transferValues = [];
      uniqueOwners.clear();
    }

    uniqueOwners.add(ownerFrom);
    uniqueOwners.add(ownerTo);

    transferValues.push({
      address: toBuffer(event.baseEventParams.address),
      block: event.baseEventParams.block,
      block_hash: toBuffer(event.baseEventParams.blockHash),
      tx_hash: toBuffer(event.baseEventParams.txHash),
      tx_index: event.baseEventParams.txIndex,
      log_index: event.baseEventParams.logIndex,
      timestamp: event.baseEventParams.timestamp,
      batch_index: event.baseEventParams.batchIndex,
      from: toBuffer(event.from),
      to: toBuffer(event.to),
      token_id: event.tokenId,
      amount: event.amount,
    });

    if (!uniqueContracts.has(contractId)) {
      uniqueContracts.add(contractId);

      contractValues.push({
        address: toBuffer(event.baseEventParams.address),
        kind: event.kind,
      });
    }

    const tokenId = `${contractId}-${event.tokenId}`;
    if (!uniqueTokens.has(tokenId)) {
      uniqueTokens.add(tokenId);

      tokenValues.push({
        collection_id: event.baseEventParams.address,
        contract: toBuffer(event.baseEventParams.address),
        token_id: event.tokenId,
        minted_timestamp: event.baseEventParams.timestamp,
      });
    }
  }

  if (transferValues.length) {
    uniqueOwnersTransferValues.push(transferValues); // Add the last batch of transfer values
  }

  if (uniqueOwnersTransferValues.length) {
    for (const transferEvents of uniqueOwnersTransferValues) {
      const nftTransferQueries: string[] = [];
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
          "from",
          "to",
          "token_id",
          "amount",
        ],
        { table: "nft_transfer_events" }
      );

      // Atomically insert the transfer events and update balances
      nftTransferQueries.push(`
        WITH "x" AS (
          INSERT INTO "nft_transfer_events" (
            "address",
            "block",
            "block_hash",
            "tx_hash",
            "tx_index",
            "log_index",
            "timestamp",
            "batch_index",
            "from",
            "to",
            "token_id",
            "amount"
          ) VALUES ${pgp.helpers.values(transferEvents, columns)}
          ON CONFLICT DO NOTHING
          RETURNING
            "address",
            "token_id",
            ARRAY["from", "to"] AS "owners",
            ARRAY[-"amount", "amount"] AS "amount_deltas",
            ARRAY[NULL, to_timestamp("timestamp")] AS "timestamps"
        )
        INSERT INTO "nft_balances" (
          "contract",
          "token_id",
          "owner",
          "amount",
          "acquired_at"
        ) (
          SELECT
            "y"."address",
            "y"."token_id",
            "y"."owner",
            SUM("y"."amount_delta"),
            MIN("y"."timestamp")
          FROM (
            SELECT
              "address",
              "token_id",
              unnest("owners") AS "owner",
              unnest("amount_deltas") AS "amount_delta",
              unnest("timestamps") AS "timestamp"
            FROM "x"
          ) "y"
          GROUP BY "y"."address", "y"."token_id", "y"."owner"
        )
        ON CONFLICT ("contract", "token_id", "owner") DO
        UPDATE SET 
          "amount" = "nft_balances"."amount" + "excluded"."amount", 
          "acquired_at" = COALESCE(GREATEST("excluded"."acquired_at", "nft_balances"."acquired_at"), "nft_balances"."acquired_at")
      `);

      await insertQueries(nftTransferQueries, backfill);
    }
  }

  if (contractValues.length) {
    const queries: string[] = [];

    const columns = new pgp.helpers.ColumnSet(["address", "kind"], {
      table: "contracts",
    });

    queries.push(`
      INSERT INTO "contracts" (
        "address",
        "kind"
      ) VALUES ${pgp.helpers.values(contractValues, columns)}
      ON CONFLICT DO NOTHING
    `);

    await insertQueries(queries, backfill);
  }

  if (tokenValues.length) {
    for (const tokenValuesChunk of _.chunk(tokenValues, 1000)) {
      const queries: string[] = [];

      if (!config.liquidityOnly) {
        const columns = new pgp.helpers.ColumnSet(["contract", "token_id", "minted_timestamp"], {
          table: "tokens",
        });

        queries.push(`
          INSERT INTO "tokens" (
            "contract",
            "token_id",
            "minted_timestamp"
          ) VALUES ${pgp.helpers.values(tokenValuesChunk, columns)}
          ON CONFLICT (contract, token_id) DO UPDATE SET minted_timestamp = EXCLUDED.minted_timestamp WHERE EXCLUDED.minted_timestamp < tokens.minted_timestamp
        `);
      } else {
        const columns = new pgp.helpers.ColumnSet(
          ["collection_id", "contract", "token_id", "minted_timestamp"],
          {
            table: "tokens",
          }
        );

        queries.push(`
          INSERT INTO "tokens" (
            "collection_id",
            "contract",
            "token_id",
            "minted_timestamp"
          ) VALUES ${pgp.helpers.values(tokenValuesChunk, columns)}
          ON CONFLICT (contract, token_id) DO UPDATE SET minted_timestamp = EXCLUDED.minted_timestamp WHERE EXCLUDED.minted_timestamp < tokens.minted_timestamp
        `);
      }

      await insertQueries(queries, backfill);
    }
  }
};

async function insertQueries(queries: string[], backfill: boolean) {
  if (backfill) {
    // When backfilling, use the write buffer to avoid deadlocks
    for (const query of _.chunk(queries, 1000)) {
      await nftTransfersWriteBuffer.addToQueue(pgp.helpers.concat(query));
    }
  } else {
    // Otherwise write directly since there might be jobs that depend
    // on the events to have been written to the database at the time
    // they get to run and we have no way to easily enforce this when
    // using the write buffer.
    try {
      await idb.none(pgp.helpers.concat(queries));
    } catch (error) {
      await nftTransfersWriteBuffer.addToQueue(pgp.helpers.concat(queries));
      logger.error("nft-transfer-event", pgp.helpers.concat(queries));
    }
  }
}

export const removeEvents = async (block: number, blockHash: string) => {
  // Atomically delete the transfer events and revert balance updates
  await idb.any(
    `
      WITH "x" AS (
        DELETE FROM "nft_transfer_events"
        WHERE "block" = $/block/ AND "block_hash" = $/blockHash/
        RETURNING
          "address",
          "token_id",
          ARRAY["from", "to"] AS "owners",
          ARRAY["amount", -"amount"] AS "amount_deltas"
      )
      INSERT INTO "nft_balances" (
        "contract",
        "token_id",
        "owner",
        "amount"
      ) (
        SELECT
          "y"."address",
          "y"."token_id",
          "y"."owner",
          SUM("y"."amount_delta")
        FROM (
          SELECT
            "address",
            "token_id",
            unnest("owners") AS "owner",
            unnest("amount_deltas") AS "amount_delta"
          FROM "x"
        ) "y"
        GROUP BY "y"."address", "y"."token_id", "y"."owner"
      )
      ON CONFLICT ("contract", "token_id", "owner") DO
      UPDATE SET "amount" = "nft_balances"."amount" + EXCLUDED."amount"
    `,
    {
      block,
      blockHash: toBuffer(blockHash),
    }
  );
};
