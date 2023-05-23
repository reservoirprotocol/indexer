import { JsonRpcProvider } from "@ethersproject/providers";
import { getCallTrace } from "@georgeroman/evm-tx-simulator";
import { CallTrace, Log } from "@georgeroman/evm-tx-simulator/dist/types";

import { idb } from "@/common/db";
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

export const simulateAndSaveCollectionMint = async (collectionMint: CollectionMint) => {
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

  const minter = "0x0000000000000000000000000000000000000001";
  const contract = fromBuffer(collectionResult.contract);
  const quantity = 1;
  const price = collectionMint.price;
  const contractKind = collectionResult.kind;

  // Generate the calldata for minting
  const txData = generateMintTxData(collectionMint.details, minter, contract, quantity, price);

  // Simulate the mint
  // TODO: Binary search for the maximum quantity per wallet
  const success = await simulateMint(minter, contract, quantity, price, txData.data, contractKind);

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

const simulateMint = async (
  minter: string,
  contract: string,
  quantity: number,
  price: string,
  calldata: string,
  contractKind: "erc721" | "erc1155"
) => {
  const value = bn(price).mul(quantity);

  const provider = new JsonRpcProvider(config.traceNetworkHttpUrl);
  const callTrace = await getCallTrace(
    {
      from: minter,
      to: contract,
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
      skipReverts: true,
      includeLogs: true,
    }
  );
  if (callTrace.error) {
    return false;
  }

  const getLogs = (call: CallTrace): Log[] => {
    if (!call.logs?.length) {
      return [];
    }

    const logs = call.logs ?? [];
    for (const c of call.calls ?? []) {
      logs.push(...getLogs(c));
    }

    return logs;
  };

  const matchesEventData = (log: Log, eventData: EventData) =>
    log.address.toLowerCase() === contract &&
    log.topics[0] === eventData.topic &&
    log.topics.length === eventData.numTopics;

  for (const log of getLogs(callTrace)) {
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
