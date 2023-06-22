import { JsonRpcProvider } from "@ethersproject/providers";
import { getCallTraceLogs } from "@georgeroman/evm-tx-simulator";
import { Log } from "@georgeroman/evm-tx-simulator/dist/types";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { CollectionMint } from "@/orderbook/mints";
import { generateCollectionMintTxData } from "@/orderbook/mints/calldata/generator";

import { EventData } from "@/events-sync/data";
import * as erc721 from "@/events-sync/data/erc721";
import * as erc1155 from "@/events-sync/data/erc1155";

const internalSimulate = async (
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
    const txData = await generateCollectionMintTxData(
      collectionMint,
      minter,
      contract,
      quantity,
      price
    );

    // Simulate the mint
    // TODO: Binary search for the maximum quantity per wallet
    return internalSimulate(
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
    // know this information (eg. from a custom integration)

    // TODO: Detect the maximum quantity mintable per wallet via binary search
    const results = await Promise.all([simulate(1), simulate(2)]);
    if (results[0] && !results[1]) {
      collectionMint.maxMintsPerWallet = "1";
    }

    return results[0];
  } else {
    return simulate(1);
  }
};
