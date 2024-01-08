import _ from "lodash";

import { idb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { BaseEventParams } from "@/events-sync/parser";
import { eventsSyncNftTransfersWriteBufferJob } from "@/jobs/events-sync/write-buffers/nft-transfers-job";
import { AddressZero } from "@ethersproject/constants";
import { tokenReclacSupplyJob } from "@/jobs/token-updates/token-reclac-supply-job";
import { DeferUpdateAddressBalance } from "@/models/defer-update-address-balance";
import { getNetworkSettings } from "@/config/network";
import { logger } from "@/common/logger";

export type Event = {
  kind: ContractKind;
  from: string;
  to: string;
  tokenId: string;
  amount: string;
  baseEventParams: BaseEventParams;
};

type ContractKind = "erc721" | "erc1155" | "cryptopunks" | "erc721-like";

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

type erc721Token = {
  collection_id: string;
  contract: Buffer;
  token_id: string;
  minted_timestamp: number;
  supply?: number;
  remaining_supply?: number;
};

type erc1155Token = {
  collection_id: string;
  contract: Buffer;
  token_id: string;
  minted_timestamp: number;
};

export const addEvents = async (events: Event[], backfill: boolean) => {
  // Keep track of all unique contracts and tokens
  const uniqueContracts = new Map<string, string>();
  const uniqueTokens = new Set<string>();

  const transferValues: DbEvent[] = [];

  const contractValues: {
    address: Buffer;
    kind: ContractKind;
  }[] = [];

  const tokenValuesErc721: erc721Token[] = [];
  const tokenValuesErc1155: erc1155Token[] = [];
  const erc1155Contracts = [];

  for (const event of events) {
    const contractId = event.baseEventParams.address.toString();

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
      uniqueContracts.set(contractId, event.kind);

      contractValues.push({
        address: toBuffer(event.baseEventParams.address),
        kind: event.kind,
      });
    }

    const tokenId = `${contractId}-${event.tokenId}`;
    if (!uniqueTokens.has(tokenId)) {
      uniqueTokens.add(tokenId);

      if (uniqueContracts.get(contractId) === "erc721") {
        tokenValuesErc721.push({
          collection_id: event.baseEventParams.address,
          contract: toBuffer(event.baseEventParams.address),
          token_id: event.tokenId,
          minted_timestamp: event.baseEventParams.timestamp,
          supply: 1,
          remaining_supply: event.to === AddressZero ? 0 : 1,
        });
      } else {
        erc1155Contracts.push(event.baseEventParams.address);
        tokenValuesErc1155.push({
          collection_id: event.baseEventParams.address,
          contract: toBuffer(event.baseEventParams.address),
          token_id: event.tokenId,
          minted_timestamp: event.baseEventParams.timestamp,
        });
      }
    }
  }

  if (transferValues.length) {
    const erc1155TransfersPerTx: Record<string, string[]> = {};
    for (const event of transferValues) {
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

      const isErc1155 = _.includes(erc1155Contracts, fromBuffer(event.address));
      const deferUpdate =
        [137, 80001].includes(config.chainId) &&
        _.includes(getNetworkSettings().mintAddresses, fromBuffer(event.from)) &&
        isErc1155;

      if (isErc1155) {
        if (!erc1155TransfersPerTx[fromBuffer(event.tx_hash)]) {
          erc1155TransfersPerTx[fromBuffer(event.tx_hash)] = [];
        }

        erc1155TransfersPerTx[fromBuffer(event.tx_hash)].push(fromBuffer(event.to));
      }

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
          ) VALUES ${pgp.helpers.values(event, columns)}
          ON CONFLICT DO NOTHING
          RETURNING
            "address",
            "token_id",
            true AS "new_transfer",
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
            ORDER BY "address" ASC, "token_id" ASC, "owner" ASC
          ) "y"
          ${deferUpdate ? `WHERE y.owner != ${pgp.as.buffer(() => event.from)}` : ""}
          GROUP BY "y"."address", "y"."token_id", "y"."owner"
        )
        ON CONFLICT ("contract", "token_id", "owner") DO
        UPDATE SET 
          "amount" = "nft_balances"."amount" + "excluded"."amount", 
          "acquired_at" = COALESCE(GREATEST("excluded"."acquired_at", "nft_balances"."acquired_at"), "nft_balances"."acquired_at")
        RETURNING (SELECT x.new_transfer FROM "x")
      `);

      const result = await insertQueries(nftTransferQueries, backfill);

      if (!_.isEmpty(result) && deferUpdate) {
        await DeferUpdateAddressBalance.add(
          fromBuffer(event.from),
          fromBuffer(event.address),
          event.token_id,
          -Number(event.amount)
        );
      }
    }

    Object.keys(erc1155TransfersPerTx).forEach((txHash) => {
      const erc1155Transfers = erc1155TransfersPerTx[txHash];
      // find count of transfers where the recepient is a unique address, if its more than 100, then its a spam/airdrop
      const uniqueRecepients = _.uniq(erc1155Transfers);
      if (uniqueRecepients.length > 100) {
        logger.info(
          "airdrop-bulk-detection",
          `txHash ${txHash} has ${erc1155TransfersPerTx[txHash].length} erc1155 transfer`
        );
      }
    });
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

  if (tokenValuesErc721.length) {
    for (const tokenValuesChunk of _.chunk(tokenValuesErc721, 1000)) {
      const query = buildTokenValuesQueries(tokenValuesChunk, "erc721");
      await insertQueries([query], backfill);
    }
  }

  if (tokenValuesErc1155.length) {
    for (const tokenValuesChunk of _.chunk(tokenValuesErc1155, 1000)) {
      const query = buildTokenValuesQueries(tokenValuesChunk, "erc1155");
      await insertQueries([query], backfill);

      // Recalc supply
      await tokenReclacSupplyJob.addToQueue(
        tokenValuesChunk.map((t) => ({ contract: fromBuffer(t.contract), tokenId: t.token_id }))
      );
    }
  }
};

function buildTokenValuesQueries(tokenValuesChunk: erc721Token[] | erc1155Token[], kind: string) {
  const columns = ["contract", "token_id", "minted_timestamp"];

  if (config.liquidityOnly) {
    columns.push("collection_id");
  }

  if (kind === "erc721") {
    columns.push("supply");
    columns.push("remaining_supply");
  }

  const columnSet = new pgp.helpers.ColumnSet(columns, {
    table: "tokens",
  });

  return `
    INSERT INTO "tokens" (
      "contract",
      "token_id",
      "minted_timestamp"
      ${config.liquidityOnly ? `, "collection_id"` : ""}
      ${kind === "erc721" ? `, "supply"` : ""}
      ${kind === "erc721" ? `, "remaining_supply"` : ""}
    ) VALUES ${pgp.helpers.values(
      _.sortBy(tokenValuesChunk, ["collection_id", "token_id"]),
      columnSet
    )}
    ON CONFLICT (contract, token_id) DO UPDATE
    SET minted_timestamp = EXCLUDED.minted_timestamp, updated_at = NOW()
    WHERE EXCLUDED.minted_timestamp < tokens.minted_timestamp
  `;
}

async function insertQueries(queries: string[], backfill: boolean) {
  if (backfill) {
    // When backfilling, use the write buffer to avoid deadlocks
    for (const query of _.chunk(queries, 1000)) {
      await eventsSyncNftTransfersWriteBufferJob.addToQueue({ query: pgp.helpers.concat(query) });
    }
  } else {
    // Otherwise write directly since there might be jobs that depend
    // on the events to have been written to the database at the time
    // they get to run and we have no way to easily enforce this when
    // using the write buffer.
    return await idb.manyOrNone(pgp.helpers.concat(queries));
  }
}

export const removeEvents = async (block: number, blockHash: string) => {
  // Atomically delete the transfer events and revert balance updates
  await idb.any(
    `
      WITH "x" AS (
        UPDATE "nft_transfer_events"
        SET is_deleted = 1, updated_at = now()
        WHERE "block" = $/block/
          AND "block_hash" = $/blockHash/
          AND is_deleted = 0
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
          ORDER BY "address" ASC, "token_id" ASC, "owner" ASC
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
