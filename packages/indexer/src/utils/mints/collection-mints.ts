import { defaultAbiCoder } from "@ethersproject/abi";
import { JsonRpcProvider } from "@ethersproject/providers";
import { getCallTrace } from "@georgeroman/evm-tx-simulator";
import { CallTrace, Log } from "@georgeroman/evm-tx-simulator/dist/types";
import { TxData } from "@reservoir0x/sdk/src/utils";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

import { EventData } from "@/events-sync/data";
import * as erc721 from "@/events-sync/data/erc721";
import * as erc1155 from "@/events-sync/data/erc1155";

export type MintDetails =
  | {
      kind: "empty";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "numeric";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "address";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "numeric-address";
      methodSignature: string;
      methodParams: string;
    }
  | {
      kind: "address-numeric";
      methodSignature: string;
      methodParams: string;
    };

export const getMintTxData = (
  details: MintDetails,
  minter: string,
  contract: string,
  quantity: number,
  price: string
): TxData => {
  const params = details.methodParams.split(",");
  logger.info("mints-process", JSON.stringify({ params, minter, quantity }));

  let calldata: string | undefined;
  switch (details.kind) {
    case "empty":
      calldata = details.methodSignature;
      break;

    case "numeric":
      calldata = details.methodSignature + defaultAbiCoder.encode(params, [quantity]).slice(2);
      break;

    case "address":
      calldata = details.methodSignature + defaultAbiCoder.encode(params, [minter]).slice(2);
      break;

    case "numeric-address":
      calldata =
        details.methodSignature + defaultAbiCoder.encode(params, [quantity, minter]).slice(2);
      break;

    case "address-numeric":
      calldata =
        details.methodSignature + defaultAbiCoder.encode(params, [minter, quantity]).slice(2);
      break;
  }

  logger.info("mints-process", JSON.stringify({ calldata }));

  if (!calldata) {
    throw new Error("Mint not supported");
  }

  return {
    from: minter,
    to: contract,
    data: calldata,
    value: bn(price).mul(quantity).toHexString(),
  };
};

export type CollectionMint = {
  collection: string;
  kind: "public";
  status: "open" | "closed";
  details: MintDetails;
  currency: string;
  price: string;
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

  // Generate the calldata for minting
  const minter = "0x0000000000000000000000000000000000000001";
  const contract = fromBuffer(collectionResult.contract);
  const quantity = 1;
  const price = collectionMint.price;
  const contractKind = collectionResult.kind;
  const txData = getMintTxData(collectionMint.details, minter, contract, quantity, price);

  // Simulate the mint
  // TODO: Binary search for the maximum quantity per wallet
  const success = await simulateMint(minter, contract, quantity, price, txData.data, contractKind);

  if (success) {
    await idb.none(
      `
        INSERT INTO collection_mints (
          collection_id,
          kind,
          status,
          details,
          currency,
          price
        ) VALUES (
          $/collection/,
          $/kind/,
          $/status/,
          $/details:json/,
          $/currency/,
          $/price/
        ) ON CONFLICT DO NOTHING
      `,
      {
        collection: collectionMint.collection,
        kind: collectionMint.kind,
        status: collectionMint.status,
        details: collectionMint.details,
        currency: toBuffer(collectionMint.currency),
        price: collectionMint.price,
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
