import _ from "lodash";

import { idb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { eventsSyncNftTransfersWriteBufferJob } from "@/jobs/events-sync/write-buffers/nft-transfers-job";
import { AddressZero } from "@ethersproject/constants";
import { tokenReclacSupplyJob } from "@/jobs/token-updates/token-reclac-supply-job";
import { getRouters } from "@/utils/routers";
import { DeferUpdateAddressBalance } from "@/models/defer-update-address-balance";
import { getNetworkSettings } from "@/config/network";
import { BaseEventParams } from "../parser";
import { allEventsAddresses } from "../data";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { logger } from "@/common/logger";
import { collectionCheckSpamJob } from "@/jobs/collections-refresh/collections-check-spam-job";

export type Event = {
  kind: ContractKind;
  from: string;
  to: string;
  tokenId: string;
  amount: string;
  baseEventParams: BaseEventParams;
};

type ContractKind = "erc721" | "erc1155" | "cryptopunks" | "erc721-like";

export type DbEvent = {
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
  kind: "airdrop" | "mint" | "burn" | null;
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
    const ns = getNetworkSettings();
    const contractId = event.baseEventParams.address.toString();
    // If its a mint, and the recipient did NOT initiate the transaction, then its an airdrop
    const routers = await getRouters();
    const kind: DbEvent["kind"] = getEventKind(
      {
        from: event.from,
        to: event.to,
        baseEventParams: {
          from: event.baseEventParams.from,
          // Because to can be null (contract creation, but we should never encounter it as null here its just for types to be happy)
          to: event.baseEventParams.to || AddressZero,
        },
      },
      routers
    );
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
      kind: kind,
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
          remaining_supply: ns.burnAddresses.includes(event.to) ? 0 : 1,
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
    const erc1155TransfersPerTx: Record<
      string,
      {
        to: string;
        contract: string;
      }[]
    > = {};
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
          "kind",
        ],
        { table: "nft_transfer_events" }
      );

      const isErc1155 = _.includes(erc1155Contracts, fromBuffer(event.address));
      const deferUpdate =
        [1, 137, 80001].includes(config.chainId) &&
        _.includes(getNetworkSettings().mintAddresses, fromBuffer(event.from)) &&
        isErc1155;

      if (isErc1155) {
        if (!erc1155TransfersPerTx[fromBuffer(event.tx_hash)]) {
          erc1155TransfersPerTx[fromBuffer(event.tx_hash)] = [];
        }

        erc1155TransfersPerTx[fromBuffer(event.tx_hash)].push({
          to: fromBuffer(event.to),
          contract: fromBuffer(event.address),
        });
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
            "amount",
            "kind"
          ) VALUES ${pgp.helpers.values(event, columns)}
          ON CONFLICT DO NOTHING
          RETURNING
            "address",
            "token_id",
            "kind",
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
          "acquired_at",
          "is_airdropped"
        ) (
          SELECT
            "y"."address",
            "y"."token_id",
            "y"."owner",
            SUM("y"."amount_delta"),
            MIN("y"."timestamp"),
            "y"."is_airdropped"
          FROM (
            SELECT
              "address",
              "token_id",
              unnest("owners") AS "owner",
              unnest("amount_deltas") AS "amount_delta",
              unnest("timestamps") AS "timestamp",
              "kind" = 'airdrop' AS "is_airdropped"
            FROM "x"
            ORDER BY "address" ASC, "token_id" ASC, "owner" ASC, "kind" ASC
          ) "y"
          ${deferUpdate ? `WHERE y.owner != ${pgp.as.buffer(() => event.from)}` : ""}
          GROUP BY "y"."address", "y"."token_id", "y"."owner", "y"."is_airdropped"
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

    await Promise.all(
      Object.keys(erc1155TransfersPerTx).map(async (txHash) => {
        const erc1155Transfers = erc1155TransfersPerTx[txHash];
        // find count of transfers where the recepient is a unique address, if its more than 100, then its a spam/airdrop
        const contracts = _.uniq(erc1155Transfers.map((t) => t.contract));
        contracts.forEach(async (contract) => {
          const uniqueRecepients = _.uniq(
            erc1155Transfers.filter((t) => t.contract === contract).map((t) => t.to)
          );
          if (uniqueRecepients.length > 100) {
            logger.info(
              "backfill-airdrops",
              `contract is burst spam: ${contract} | txHash: ${txHash}`
            );
            await collectionCheckSpamJob.addToQueue({
              collectionId: contract,
              trigger: "transfer-burst",
            });
          }
        });
      })
    );
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
    SET minted_timestamp = EXCLUDED.minted_timestamp, updated_at = NOW() ${
      kind === "erc721"
        ? `, supply = EXCLUDED.supply, remaining_supply = EXCLUDED.remaining_supply`
        : ""
    }
    WHERE EXCLUDED.minted_timestamp < tokens.minted_timestamp
    ${
      kind === "erc721"
        ? `OR EXCLUDED.remaining_supply IS DISTINCT FROM tokens.remaining_supply`
        : ""
    }
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

export const getEventKind = (
  event: {
    from: string;
    to: string;
    baseEventParams: {
      from: string;
      to: string;
    };
  },
  routers: Map<string, SourcesEntity>
): DbEvent["kind"] => {
  const ns = getNetworkSettings();
  let kind: DbEvent["kind"] = null;
  // event.baseEventParams.from is the sender of the transaction
  // event.baseEventParams.to is the receiver of the transaction
  // event.from is the sender of the transfer event
  // event.to is the receiver of the transfer event

  // requirements to be considered an airdrop:
  // if the recipient of the nft did not initiate the transaction
  // AND
  // if the recipient of the nft is not a burn address
  // AND
  // if the contract being interacted with is not a router
  // AND
  // if the contract being interacted with is not a known mint address
  if (
    event.baseEventParams.from !== event.to &&
    event.baseEventParams?.to &&
    !ns.burnAddresses.includes(event.to) &&
    !routers.has(event.baseEventParams?.to) &&
    !allEventsAddresses.includes(event.baseEventParams?.to)
  ) {
    kind = "airdrop";
  } else if (ns.mintAddresses.includes(event.from)) {
    kind = "mint";
  } else if (ns.burnAddresses.includes(event.to)) {
    kind = "burn";
  }

  return kind;
};
