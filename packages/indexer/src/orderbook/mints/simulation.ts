import { JsonRpcProvider } from "@ethersproject/providers";
import { getCallTraceLogs } from "@georgeroman/evm-tx-simulator";
import { Log } from "@georgeroman/evm-tx-simulator/dist/types";
import { Network, TxData } from "@reservoir0x/sdk/dist/utils";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { CollectionMint } from "@/orderbook/mints";
import { generateCollectionMintTxData } from "@/orderbook/mints/calldata";

import { EventData } from "@/events-sync/data";
import * as erc721 from "@/events-sync/data/erc721";
import * as erc1155 from "@/events-sync/data/erc1155";

// Fetch any events that get emitted from transaction simulation
const getEmittedEvents = async (txData: TxData) => {
  const provider = new JsonRpcProvider(config.traceNetworkHttpUrl);
  const value = txData.value ?? bn(0);
  return getCallTraceLogs(
    {
      from: txData.from,
      to: txData.to,
      data: txData.data,
      value,
      gas: 10000000,
      gasPrice: 0,
      balanceOverrides: {
        [txData.from]: value,
      },
    },
    provider,
    {
      method: [
        Network.Ethereum,
        Network.EthereumGoerli,
        Network.EthereumSepolia,
        Network.Optimism,
        Network.Bsc,
        Network.Zora,
        Network.ZoraTestnet,
        Network.BaseGoerli,
      ].includes(config.chainId)
        ? "withLog"
        : "customTrace",
    }
  );
};

// Returns whether the simulation of a mint transaction was successful or not
const simulateMintTxData = async (
  contract: string,
  contractKind: "erc721" | "erc1155",
  quantity: number,
  txData: TxData
) => {
  let logs: Log[];
  try {
    logs = await getEmittedEvents(txData);
    logger.info("mints-process", `Emitted events: ${JSON.stringify(logs)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    logger.info("mints-process", `Error fetching events: ${error} (${error.stack})`);
    return false;
  }

  const matchesEventData = (log: Log, eventData: EventData) =>
    log.address.toLowerCase() === contract &&
    log.topics[0] === eventData.topic &&
    log.topics.length === eventData.numTopics;

  for (const log of logs) {
    if (contractKind === "erc721") {
      // ERC721 `Transfer`
      if (matchesEventData(log, erc721.transfer)) {
        const parsedLog = erc721.transfer.abi.parseLog(log);
        if (parsedLog.args["to"] === txData.from) {
          return true;
        }
      }
    } else if (contractKind === "erc1155") {
      // ERC1155 `TransferSingle`
      if (matchesEventData(log, erc1155.transferSingle)) {
        const parsedLog = erc1155.transferSingle.abi.parseLog(log);
        if (
          parsedLog.args["to"] === txData.from &&
          parsedLog.args["amount"].toString() === String(quantity)
        ) {
          return true;
        }
        // ERC1155 `TransferBatch`
      } else if (matchesEventData(log, erc1155.transferBatch)) {
        const parsedLog = erc1155.transferBatch.abi.parseLog(log);
        if (
          parsedLog.args["to"] === txData.from &&
          parsedLog.args["amounts"][0].toString() === String(quantity)
        ) {
          return true;
        }
      }
    }
  }

  return false;
};

// Returns whether a collection mint is active or not
export const simulateCollectionMint = async (
  collectionMint: CollectionMint,
  // When true and the collection mint doesn't have any predefined `maxMintsPerWallet`
  // then we'll try to detect `maxMintsPerWallet` by simulating with various quantites
  detectMaxMintsPerWallet = true
) => {
  // TODO: Add support for simulating non-public mints
  if (collectionMint.kind !== "public") {
    return collectionMint.status === "open";
  }

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
  const contractKind = collectionResult.kind;

  const simulate = async (quantity: number) =>
    // Generate and simulate the mint transaction
    generateCollectionMintTxData(collectionMint, minter, quantity).then(({ txData }) =>
      simulateMintTxData(contract, contractKind, quantity, txData)
    );

  if (detectMaxMintsPerWallet && collectionMint.maxMintsPerWallet === undefined) {
    // TODO: Improve accuracy of `maxMintsPerWallet` via binary search
    const results = await Promise.all([simulate(1), simulate(2)]);
    if (results[0] && !results[1]) {
      collectionMint.maxMintsPerWallet = "1";
    }

    return results[0];
  } else {
    return simulate(1);
  }
};
