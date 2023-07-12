/* eslint-disable  @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { EventKind, getEventData } from "@/events-sync/data";
import { EventsBatch, EventsByKind, processEventsBatchV2 } from "@/events-sync/handlers";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { parseEvent } from "@/events-sync/parserV2";
import * as es from "@/events-sync/storage";
import * as syncEventsUtils from "@/events-sync/utils";
import * as blocksModel from "@/models/blocks";
import getUuidByString from "uuid-by-string";
import { BlockWithTransactions } from "@ethersproject/abstract-provider";
import * as realtimeEventsSync from "@/jobs/events-sync/realtime-queue";

import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";
import { Block } from "@/models/blocks";
import { saveTransactionLogs } from "@/models/transaction-logs";
import { TransactionTrace, saveTransactionTraces } from "@/models/transaction-traces";
import { TransactionReceipt } from "@ethersproject/providers";
import {
  supports_eth_getBlockReceipts,
  supports_eth_getBlockTrace,
} from "@/jobs/events-sync/realtime-queue";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";

export const extractEventsBatches = (enhancedEvents: EnhancedEvent[]): EventsBatch[] => {
  const txHashToEvents = new Map<string, EnhancedEvent[]>();

  enhancedEvents.forEach((event) => {
    const txHash = event.baseEventParams.txHash;
    if (!txHashToEvents.has(txHash)) {
      txHashToEvents.set(txHash, []);
    }
    txHashToEvents.get(txHash)!.push(event);
  });

  const txHashToEventsBatch = new Map<string, EventsBatch>();

  [...txHashToEvents.entries()].forEach(([txHash, events]) => {
    const kindToEvents = new Map<EventKind, EnhancedEvent[]>();
    let blockHash = "";
    let logIndex = null;
    let batchIndex = null;

    for (const event of events) {
      if (!kindToEvents.has(event.kind)) {
        kindToEvents.set(event.kind, []);
      }

      if (!blockHash) {
        blockHash = event.baseEventParams.blockHash;
        logIndex = event.baseEventParams.logIndex;
        batchIndex = event.baseEventParams.batchIndex;
      }

      kindToEvents.get(event.kind)!.push(event);
    }

    const eventsByKind: EventsByKind[] = [
      {
        kind: "erc20",
        data: kindToEvents.get("erc20") ?? [],
      },
      {
        kind: "erc721",
        data: kindToEvents.get("erc721") ?? [],
      },
      {
        kind: "erc1155",
        data: kindToEvents.get("erc1155") ?? [],
      },
      {
        kind: "blur",
        data: kindToEvents.get("blur") ?? [],
      },
      {
        kind: "cryptopunks",
        data: kindToEvents.get("cryptopunks") ?? [],
      },
      {
        kind: "decentraland",
        data: kindToEvents.get("decentraland") ?? [],
      },
      {
        kind: "element",
        data: kindToEvents.get("element") ?? [],
      },
      {
        kind: "foundation",
        data: kindToEvents.get("foundation") ?? [],
      },
      {
        kind: "looks-rare",
        data: kindToEvents.has("looks-rare")
          ? [
              ...kindToEvents.get("looks-rare")!,
              // To properly validate bids, we need some additional events
              ...events.filter((e) => e.subKind === "erc20-transfer"),
            ]
          : [],
      },
      {
        kind: "nftx",
        data: kindToEvents.get("nftx") ?? [],
      },
      {
        kind: "nouns",
        data: kindToEvents.get("nouns") ?? [],
      },
      {
        kind: "quixotic",
        data: kindToEvents.get("quixotic") ?? [],
      },
      {
        kind: "seaport",
        data: kindToEvents.has("seaport")
          ? [
              ...kindToEvents.get("seaport")!,
              // To properly validate bids, we need some additional events
              ...events.filter((e) => e.subKind === "erc20-transfer"),
            ]
          : [],
      },
      {
        kind: "sudoswap",
        data: kindToEvents.get("sudoswap") ?? [],
      },
      {
        kind: "wyvern",
        data: kindToEvents.has("wyvern")
          ? [
              ...events.filter((e) => e.subKind === "erc721-transfer"),
              ...kindToEvents.get("wyvern")!,
              // To properly validate bids, we need some additional events
              ...events.filter((e) => e.subKind === "erc20-transfer"),
            ]
          : [],
      },
      {
        kind: "x2y2",
        data: kindToEvents.has("x2y2")
          ? [
              ...kindToEvents.get("x2y2")!,
              // To properly validate bids, we need some additional events
              ...events.filter((e) => e.subKind === "erc20-transfer"),
            ]
          : [],
      },
      {
        kind: "zeroex-v4",
        data: kindToEvents.has("zeroex-v4")
          ? [
              ...kindToEvents.get("zeroex-v4")!,
              // To properly validate bids, we need some additional events
              ...events.filter((e) => e.subKind === "erc20-transfer"),
            ]
          : [],
      },
      {
        kind: "zora",
        data: kindToEvents.get("zora") ?? [],
      },
      {
        kind: "universe",
        data: kindToEvents.get("universe") ?? [],
      },
      {
        kind: "rarible",
        data: kindToEvents.has("rarible")
          ? [
              ...kindToEvents.get("rarible")!,
              // To properly validate bids, we need some additional events
              ...events.filter((e) => e.subKind === "erc20-transfer"),
            ]
          : [],
      },
      {
        kind: "manifold",
        data: kindToEvents.get("manifold") ?? [],
      },
      {
        kind: "tofu",
        data: kindToEvents.get("tofu") ?? [],
      },
      {
        kind: "bend-dao",
        data: kindToEvents.get("bend-dao") ?? [],
      },
      {
        kind: "nft-trader",
        data: kindToEvents.get("nft-trader") ?? [],
      },
      {
        kind: "okex",
        data: kindToEvents.get("okex") ?? [],
      },
      {
        kind: "superrare",
        data: kindToEvents.get("superrare") ?? [],
      },
      {
        kind: "flow",
        data: kindToEvents.has("flow")
          ? [
              ...kindToEvents.get("flow")!,
              // To properly validate bids, we need some additional events
              ...events.filter((e) => e.subKind === "erc20-transfer"),
            ]
          : [],
      },
      {
        kind: "zeroex-v2",
        data: kindToEvents.get("zeroex-v2") ?? [],
      },
      {
        kind: "zeroex-v3",
        data: kindToEvents.get("zeroex-v3") ?? [],
      },
      {
        kind: "treasure",
        data: kindToEvents.get("treasure") ?? [],
      },
      {
        kind: "looks-rare-v2",
        data: kindToEvents.get("looks-rare-v2") ?? [],
      },
      {
        kind: "blend",
        data: kindToEvents.get("blend") ?? [],
      },
      {
        kind: "collectionxyz",
        data: kindToEvents.get("collectionxyz") ?? [],
      },
    ];

    txHashToEventsBatch.set(txHash, {
      id: getUuidByString(`${txHash}:${logIndex}:${batchIndex}:${blockHash}`),
      events: eventsByKind,
    });
  });

  return [...txHashToEventsBatch.values()];
};

const _getTransactionTraces = async (Txs: { hash: string }[], block: number) => {
  const timerStart = Date.now();
  let traces;
  if (supports_eth_getBlockTrace) {
    traces = (await syncEventsUtils.getTracesFromBlock(block)) as TransactionTrace[];

    // traces don't have the transaction hash, so we need to add it by using the txs array we are passing in by using the index of the trace
    traces = traces.map((trace, index) => {
      return {
        ...trace,
        hash: Txs[index].hash,
      };
    });
  } else {
    traces = await Promise.all(
      Txs.map(async (tx) => {
        const trace = await baseProvider.send("debug_traceTransaction", [
          tx.hash,
          { tracer: "callTracer" },
        ]);
        return {
          ...trace,
          hash: tx.hash,
        };
      })
    );
  }

  const timerEnd = Date.now();

  return {
    traces,
    getTransactionTracesTime: timerEnd - timerStart,
  };
};

const _getTransactionReceiptsFromBlock = async (block: BlockWithTransactions) => {
  const timerStart = Date.now();
  let transactionReceipts;
  if (supports_eth_getBlockReceipts) {
    transactionReceipts = (await syncEventsUtils.getTransactionReceiptsFromBlock(
      block.number
    )) as TransactionReceipt[];
  } else {
    transactionReceipts = await Promise.all(
      block.transactions.map((tx) => baseProvider.getTransactionReceipt(tx.hash))
    );
  }

  const timerEnd = Date.now();
  return {
    transactionReceipts,
    getTransactionReceiptsTime: timerEnd - timerStart,
  };
};

const _saveBlock = async (blockData: Block) => {
  const timerStart = Date.now();
  await blocksModel.saveBlock(blockData);
  const timerEnd = Date.now();
  return {
    saveBlocksTime: timerEnd - timerStart,
    endSaveBlocksTime: timerEnd,
  };
};

const _saveTransactions = async (
  blockData: BlockWithTransactions,
  transactionReceipts: TransactionReceipt[]
) => {
  const timerStart = Date.now();
  await syncEventsUtils.saveBlockTransactions(blockData, transactionReceipts);
  const timerEnd = Date.now();
  return timerEnd - timerStart;
};

const getBlockSyncData = async (blockData: BlockWithTransactions) => {
  const [
    { traces, getTransactionTracesTime },
    { transactionReceipts, getTransactionReceiptsTime },
    { saveBlocksTime, endSaveBlocksTime },
  ] = await Promise.all([
    _getTransactionTraces(blockData.transactions, blockData.number),
    _getTransactionReceiptsFromBlock(blockData),
    _saveBlock({
      number: blockData.number,
      hash: blockData.hash,
      timestamp: blockData.timestamp,
    }),
  ]);

  return {
    traces,
    transactionReceipts,
    getTransactionReceiptsTime,
    getTransactionTracesTime,
    saveBlocksTime,
    endSaveBlocksTime,
  };
};

const saveLogsAndTracesAndTransactions = async (
  blockData: BlockWithTransactions,
  transactionReceipts: TransactionReceipt[],
  traces: TransactionTrace[]
) => {
  const transactionLogs: {
    hash: string;
    logs: any[];
  }[] = [];

  const logs = transactionReceipts.map((tx) => tx.logs).flat();

  transactionReceipts.forEach((tx) => {
    const logs = tx.logs.map((log) => ({
      ...log,
      address: log.address.toLowerCase(),
    }));
    transactionLogs.push({
      hash: tx.transactionHash,
      logs,
    });
  });

  const startTime = Date.now();

  await Promise.all([
    ...transactionLogs.map((txLogs) => saveTransactionLogs(txLogs)),
    saveTransactionTraces(traces),
    _saveTransactions(blockData, transactionReceipts),
  ]);

  const endTime = Date.now();

  return {
    saveLogsAndTracesAndTransactionsTime: endTime - startTime,
    logs,
  };
};

const processEvents = async (logs: any[], blockData: BlockWithTransactions) => {
  const availableEventData = getEventData();
  let enhancedEvents = logs
    .map((log) => {
      try {
        const baseEventParams = parseEvent(log, blockData.timestamp);
        return availableEventData
          .filter(
            ({ addresses, numTopics, topic }) =>
              log.topics[0] === topic &&
              log.topics.length === numTopics &&
              (addresses ? addresses[log.address.toLowerCase()] : true)
          )
          .map((eventData) => ({
            kind: eventData.kind,
            subKind: eventData.subKind,
            baseEventParams,
            log,
          }));
      } catch (error) {
        logger.error("sync-events-v2", `Failed to handle events: ${error}`);
        throw error;
      }
    })
    .flat();

  enhancedEvents = enhancedEvents.filter((e) => e) as EnhancedEvent[];

  const eventsBatches = extractEventsBatches(enhancedEvents as EnhancedEvent[]);
  const startProcessLogs = Date.now();
  const processEventsLatencies = await processEventsBatchV2(eventsBatches);
  const endProcessLogs = Date.now();

  return {
    processEventsLatencies,
    processLogsTime: endProcessLogs - startProcessLogs,
  };
};

export const syncEvents = async (block: number) => {
  try {
    logger.info("sync-events-v2", `Events realtime syncing block ${block}`);
    const startSyncTime = Date.now();
    const blockData = await syncEventsUtils.fetchBlock(block);

    if (!blockData) {
      logger.warn("sync-events-v2", `Block ${block} not found`);
      throw new Error(`Block ${block} not found`);
    }

    const endGetBlockTime = Date.now();

    const {
      traces,
      transactionReceipts,
      getTransactionReceiptsTime,
      getTransactionTracesTime,
      saveBlocksTime,
      endSaveBlocksTime,
    } = await getBlockSyncData(blockData);

    const { saveLogsAndTracesAndTransactionsTime, logs } = await saveLogsAndTracesAndTransactions(
      blockData,
      transactionReceipts,
      traces
    );
    const { processEventsLatencies, processLogsTime } = await processEvents(logs, blockData);

    const endSyncTime = Date.now();

    const timings = {
      transactions: {
        count: blockData.transactions.length,
        saveLogsAndTracesAndTransactionsTime,
      },
      blocks: {
        count: 1,
        getBlockTime: endGetBlockTime - startSyncTime,
        saveBlocksTime,
        saveLogsAndTracesAndTransactionsTime,
        blockMinedTimestamp: blockData.timestamp,
        startJobTimestamp: startSyncTime,
        getBlockTimestamp: endGetBlockTime,
      },
      receipts: {
        count: transactionReceipts.length,
        getTransactionReceiptsTime,
      },
      traces: {
        count: traces.length,
        getTransactionTracesTime,
        saveLogsAndTracesAndTransactionsTime,
      },
      logs: {
        count: logs.length,
        getTransactionReceiptsTime,
        processLogsTime,
        saveLogsAndTracesAndTransactionsTime,
      },
      processEventsLatencies: processEventsLatencies,
      totalSyncTime: endSyncTime - startSyncTime,
      blockSyncTime: endSaveBlocksTime - startSyncTime,
    };

    logger.info(
      "sync-events-timing-v2",
      JSON.stringify({
        message: `Events realtime syncing block ${block}`,
        block,
        ...timings,
      })
    );
  } catch (error) {
    logger.warn("sync-events-v2", `Events realtime syncing failed: ${error}, block: ${block}`);
    throw error;
  }
};

export const unsyncEvents = async (block: number, blockHash: string) => {
  await Promise.all([
    es.fills.removeEvents(block, blockHash),
    es.bulkCancels.removeEvents(block, blockHash),
    es.nonceCancels.removeEvents(block, blockHash),
    es.cancels.removeEvents(block, blockHash),
    es.ftTransfers.removeEvents(block, blockHash),
    es.nftApprovals.removeEvents(block, blockHash),
    es.nftTransfers.removeEvents(block, blockHash),
    removeUnsyncedEventsActivities.addToQueue(blockHash),
  ]);
};

export const checkForMissingBlocks = async (block: number) => {
  // lets set the latest block to the block we are syncing if it is higher than the current latest block by 1. If it is higher than 1, we create a job to sync the missing blocks
  // if its lower than the current latest block, we dont update the latest block in redis, but we still sync the block (this is for when we are catching up on missed blocks, or when we are syncing a block that is older than the current latest block)
  const latestBlock = await redis.get("latest-block-realtime");
  if (latestBlock) {
    const latestBlockNumber = Number(latestBlock);
    if (block > latestBlockNumber) {
      await redis.set("latest-block-realtime", block);
      if (block - latestBlockNumber > 1) {
        // if we are missing more than 1 block, we need to sync the missing blocks
        for (let i = latestBlockNumber + 1; i < block; i++) {
          logger.info("sync-events-v2", `Found missing block: ${i}`);
          await realtimeEventsSync.addToQueue({ block: i });
        }
      }
    }
  } else {
    await redis.set("latest-block-realtime", block);
  }
};

export const checkForOrphanedBlock = async (block: number) => {
  // Check if block number / hash does not match up (orphaned block)
  const upstreamBlockHash = (await baseProvider.getBlock(block)).hash.toLowerCase();

  // get block from db that has number = block and hash != upstreamBlockHash
  const orphanedBlock = await blocksModel.getBlockWithNumber(block, upstreamBlockHash);

  if (!orphanedBlock) return;

  logger.info(
    "events-sync-catchup",
    `Detected orphaned block ${block} with hash ${orphanedBlock.hash} (upstream hash ${upstreamBlockHash})`
  );

  // delete the orphaned block data
  await unsyncEvents(block, orphanedBlock.hash);

  // TODO: add block hash to transactions table and delete transactions associated to the orphaned block
  // await deleteBlockTransactions(block);

  // delete the block data
  await blocksModel.deleteBlock(block, orphanedBlock.hash);
};
