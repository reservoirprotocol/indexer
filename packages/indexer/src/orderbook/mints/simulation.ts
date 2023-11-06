import { getCallResult, getCallTraceLogs } from "@georgeroman/evm-tx-simulator";
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
import { baseProvider } from "@/common/provider";

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

  // Some network don't support the RPC calls the simulation depends on,
  // so in this case we only let through mints having a known standard
  if ([Network.PolygonZkevm, Network.Zksync, Network.Scroll].includes(config.chainId)) {
    return collectionMint.standard !== "unknown";
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

type NFTTransferEvent = {
  contract: string;
  from: string;
  to: string;
  tokenId: string;
  amount: string;
};

export const getNFTTransferEvents = async (txData: TxData): Promise<NFTTransferEvent[]> => {
  try {
    const logs = await getEmittedEvents(txData, config.chainId);

    const matchesEventData = (log: Log, eventData: EventData) =>
      log.topics[0] === eventData.topic && log.topics.length === eventData.numTopics;

    const events: NFTTransferEvent[] = [];
    for (const log of logs) {
      if (matchesEventData(log, erc721.transfer)) {
        // ERC721 `Transfer`
        const parsedLog = erc721.transfer.abi.parseLog(log);
        events.push({
          contract: log.address.toLowerCase(),
          from: parsedLog.args["from"].toLowerCase(),
          to: parsedLog.args["to"].toLowerCase(),
          tokenId: parsedLog.args["tokenId"].toString(),
          amount: "1",
        });
      } else if (matchesEventData(log, erc1155.transferSingle)) {
        // ERC1155 `TransferSingle`
        const parsedLog = erc1155.transferSingle.abi.parseLog(log);
        events.push({
          contract: log.address.toLowerCase(),
          from: parsedLog.args["from"].toLowerCase(),
          to: parsedLog.args["to"].toLowerCase(),
          tokenId: parsedLog.args["tokenId"].toString(),
          amount: parsedLog.args["amount"].toString(),
        });
      } else if (matchesEventData(log, erc1155.transferBatch)) {
        // ERC1155 `TransferBatch`
        const parsedLog = erc1155.transferBatch.abi.parseLog(log);
        for (let i = 0; i < parsedLog.args["amounts"].length; i++) {
          events.push({
            contract: log.address.toLowerCase(),
            from: parsedLog.args["from"].toLowerCase(),
            to: parsedLog.args["to"].toLowerCase(),
            tokenId: parsedLog.args["tokenIds"][i].toString(),
            amount: parsedLog.args["amounts"][i].toString(),
          });
        }
      }
    }

    return events;
  } catch {
    // Ignore errors
  }

  return [];
};

const simulateMintTxData = async (
  contract: string,
  contractKind: "erc721" | "erc1155",
  quantity: number,
  txData: TxData
) => {
  if (
    [
      Network.Ethereum,
      Network.EthereumGoerli,
      Network.EthereumSepolia,
      Network.Optimism,
      // Network.Polygon,
      // Network.Arbitrum,
      Network.Bsc,
      Network.Zora,
      Network.ZoraTestnet,
      Network.Base,
      Network.BaseGoerli,
      Network.Ancient8Testnet,
    ].includes(config.chainId)
  ) {
    // CASE 1
    // If supported, use `debug_traceCall` (very accurate)

    let logs: Log[];
    try {
      logs = await getEmittedEvents(txData, config.chainId);
      logger.info("mints-simulation", `Emitted events: ${JSON.stringify(logs)}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      logger.info("mints-simulation", `Error fetching events: ${error} (${error.stack})`);
      return false;
    }

    const matchesEventData = (log: Log, eventData: EventData) =>
      log.address.toLowerCase() === contract &&
      log.topics[0] === eventData.topic &&
      log.topics.length === eventData.numTopics;

    let count = bn(0);
    for (const log of logs) {
      if (contractKind === "erc721") {
        // ERC721 `Transfer`
        if (matchesEventData(log, erc721.transfer)) {
          const parsedLog = erc721.transfer.abi.parseLog(log);
          if (parsedLog.args["to"] === txData.from) {
            count = count.add(1);
          }
        }
      } else if (contractKind === "erc1155") {
        // ERC1155 `TransferSingle`
        if (matchesEventData(log, erc1155.transferSingle)) {
          const parsedLog = erc1155.transferSingle.abi.parseLog(log);
          if (parsedLog.args["to"] === txData.from) {
            count = count.add(parsedLog.args["amount"]);
          }
          // ERC1155 `TransferBatch`
        } else if (matchesEventData(log, erc1155.transferBatch)) {
          const parsedLog = erc1155.transferBatch.abi.parseLog(log);
          if (parsedLog.args["to"] === txData.from) {
            count = count.add(parsedLog.args["amounts"][0]);
          }
        }
      }
    }

    if (count.toString() === String(quantity)) {
      return true;
    }

    return false;
  } else {
    // CASE 2
    // Default to using `eth_call` (which isn't very accurate)

    try {
      const result = await triggerCall(txData);
      logger.info("mints-simulation", `Call result: ${result}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      logger.info("mints-simulation", `Error simulating call: ${error} (${error.stack})`);
      return false;
    }

    return true;
  }
};

const getEmittedEvents = async (txData: TxData, chainId: number) => {
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
    baseProvider,
    {
      method: [Network.Polygon, Network.Arbitrum].includes(chainId) ? "opcodeTrace" : "withLog",
    }
  );
};

const triggerCall = async (txData: TxData) => {
  const value = bn(txData.value ?? 0);

  return getCallResult(
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
    baseProvider
  );
};
