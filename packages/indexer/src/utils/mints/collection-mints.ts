import { JsonRpcProvider } from "@ethersproject/providers";
import { getCallTraceLogs } from "@georgeroman/evm-tx-simulator";
import { Log } from "@georgeroman/evm-tx-simulator/dist/types";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { MintDetails, generateMintTxData } from "@/utils/mints/calldata/generator";

import { EventData } from "@/events-sync/data";
import * as erc721 from "@/events-sync/data/erc721";
import * as erc1155 from "@/events-sync/data/erc1155";

export type CollectionMint = {
  collection: string;
  stage: string;
  // TODO: Refactor these hardcoded types
  kind: "public";
  status: "open" | "closed";
  standard: "unknown";
  details: MintDetails;
  currency: string;
  price: string;
  maxMintsPerWallet?: number;
  startTime?: number;
  endTime?: number;
};

export const getOpenCollectionMints = async (collection: string): Promise<CollectionMint[]> => {
  const results = await idb.manyOrNone(
    `
      SELECT
        collection_mints.*,
        collection_mint_standards.standard
      FROM collection_mints
      JOIN collection_mint_standards
        ON collection_mints.collection_id = collection_mint_standards.collection_id
      WHERE collection_mints.collection_id = $/collection/
        AND collection_mints.status = 'open'
    `,
    { collection }
  );

  return results.map(
    (r) =>
      ({
        collection: r.collection_id,
        stage: r.stage,
        kind: r.kind,
        status: r.status,
        standard: r.standard,
        details: r.details,
        currency: fromBuffer(r.currency),
        price: r.price,
        maxMintsPerWallet: r.max_mints_per_wallet,
        startTime: r.start_time ? Math.floor(new Date(r.start_time).getTime() / 1000) : undefined,
        endTime: r.end_time ? Math.floor(new Date(r.end_time).getTime() / 1000) : undefined,
      } as CollectionMint)
  );
};

export const simulateCollectionMint = async (
  collectionMint: CollectionMint,
  detectMaxMintsPerWallet = true
) => {
  // Fetch the collection's contract and kind
  const collectionResult = await idb.oneOrNone(
    `
      SELECT
        collections.contract,
        contracts.kind
      FROM collections
      JOIN contracts
        ON collections.contract = contracts.address
      WHERE collections.id = $/collection/
    `,
    { collection: collectionMint.collection }
  );
  if (!collectionResult) {
    return false;
  }

  const minter = "0x0000000000000000000000000000000000000001";
  const contract = fromBuffer(collectionResult.contract);
  const price = collectionMint.price;
  const contractKind = collectionResult.kind;

  const simulate = async (quantity: number) => {
    // Generate the calldata for minting
    const txData = generateMintTxData(collectionMint.details, minter, contract, quantity, price);

    // Simulate the mint
    // TODO: Binary search for the maximum quantity per wallet
    return simulateViaOnChainCall(
      minter,
      contract,
      contractKind,
      quantity,
      price,
      txData.to,
      txData.data
    );
  };

  if (detectMaxMintsPerWallet && collectionMint.maxMintsPerWallet === undefined) {
    // Only try to detect the mintable quantity if we don't already
    // know this information (eg.from a custom integration)

    // TODO: Detect the maximum quantity mintable per wallet via binary search
    const results = await Promise.all([simulate(1), simulate(2)]);
    if (results[0] && !results[1]) {
      collectionMint.maxMintsPerWallet = 1;
    }

    return results[0];
  } else {
    return simulate(1);
  }
};

export const simulateAndUpdateCollectionMint = async (collectionMint: CollectionMint) => {
  const success = await simulateCollectionMint(collectionMint, false);
  await idb.none(
    `
      UPDATE collection_mints SET
        status = $/status/,
        updated_at = now()
      WHERE collection_mints.collection_id = $/collection/
        AND collection_mints.stage = $/stage/
        AND collection_mints.status != $/status/
    `,
    {
      collection: collectionMint.collection,
      stage: collectionMint.stage,
      status: success ? "open" : "closed",
    }
  );
};

export const simulateAndSaveCollectionMint = async (collectionMint: CollectionMint) => {
  const success = await simulateCollectionMint(collectionMint);
  if (success) {
    await idb.none(
      `
        INSERT INTO collection_mint_standards (
          collection_id,
          standard
        ) VALUES (
          $/collection/,
          $/standard/
        ) ON CONFLICT DO NOTHING
      `,
      {
        collection: collectionMint.collection,
        standard: collectionMint.standard,
      }
    );

    await idb.none(
      `
        INSERT INTO collection_mints (
          collection_id,
          stage,
          kind,
          status,
          details,
          currency,
          price,
          max_mints_per_wallet,
          start_time,
          end_time
        ) VALUES (
          $/collection/,
          $/stage/,
          $/kind/,
          $/status/,
          $/details:json/,
          $/currency/,
          $/price/,
          $/maxMintsPerWallet/,
          $/startTime/,
          $/endTime/
        ) ON CONFLICT DO NOTHING
      `,
      {
        collection: collectionMint.collection,
        stage: collectionMint.stage,
        kind: collectionMint.kind,
        status: collectionMint.status,
        details: collectionMint.details,
        currency: toBuffer(collectionMint.currency),
        price: collectionMint.price,
        maxMintsPerWallet: collectionMint.maxMintsPerWallet ?? null,
        startTime: collectionMint.startTime ? new Date(collectionMint.startTime * 1000) : null,
        endTime: collectionMint.endTime ? new Date(collectionMint.endTime * 1000) : null,
      }
    );
  }

  return success;
};

export const simulateViaOnChainCall = async (
  minter: string,
  contract: string,
  contractKind: "erc721" | "erc1155",
  quantity: number,
  price: string,
  to: string,
  calldata: string
) => {
  const value = bn(price).mul(quantity);

  const provider = new JsonRpcProvider(config.traceNetworkHttpUrl);

  let logs: Log[];
  try {
    logs = await getCallTraceLogs(
      {
        from: minter,
        to,
        data: calldata,
        value,
        gas: 10000000,
        gasPrice: 0,
        balanceOverrides: {
          [minter]: value,
        },
      },
      provider,
      {
        method: "withLog",
      }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.info("mints-process", `Error: ${error} (${error.stack})`);
    return false;
  }

  const matchesEventData = (log: Log, eventData: EventData) =>
    log.address.toLowerCase() === contract &&
    log.topics[0] === eventData.topic &&
    log.topics.length === eventData.numTopics;

  logger.info("mints-process", `Logs: ${JSON.stringify(logs)}`);

  for (const log of logs) {
    if (contractKind === "erc721") {
      if (matchesEventData(log, erc721.transfer)) {
        const parsedLog = erc721.transfer.abi.parseLog(log);
        if (parsedLog.args["to"] === minter) {
          return true;
        }
      }
    } else if (contractKind === "erc1155") {
      if (matchesEventData(log, erc1155.transferSingle)) {
        const parsedLog = erc1155.transferSingle.abi.parseLog(log);
        if (
          parsedLog.args["to"] === minter &&
          parsedLog.args["amount"].toString() === String(quantity)
        ) {
          return true;
        }
      } else if (matchesEventData(log, erc1155.transferBatch)) {
        const parsedLog = erc1155.transferBatch.abi.parseLog(log);
        if (
          parsedLog.args["to"] === minter &&
          parsedLog.args["amounts"][0].toString() === String(quantity)
        ) {
          return true;
        }
      }
    }
  }

  return false;
};
