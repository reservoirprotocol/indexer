/* eslint-disable  @typescript-eslint/no-explicit-any */

import { logger } from "@/common/logger";
import { EventKind, getEventData } from "@/events-sync/data";
import { EventsBatch, EventsByKind, processEventsBatchV2 } from "@/events-sync/handlers";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { parseEvent } from "@/events-sync/parserV2";
import * as es from "@/events-sync/storage";
import * as syncEventsUtils from "@/events-sync/utilsV2";
import * as blocksModel from "@/models/blocks";
import getUuidByString from "uuid-by-string";
import { BlockWithTransactions } from "@ethersproject/abstract-provider";

// import * as realtimeEventsSyncV2 from "@/jobs/events-sync/realtime-queue-v2";

import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";
import { Block } from "@/models/blocks";
import { saveTransactionLogs } from "@/models/transaction-logs";
import { fetchTransactionTrace } from "@/events-sync/utils";
import { TransactionTrace, saveTransactionTraces } from "@/models/transaction-traces";
import { TransactionReceipt } from "@ethersproject/providers";

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

// const _getLogs = async (eventFilter: Filter) => {
//   const timerStart = Date.now();
//   const logs = await baseProvider.getLogs(eventFilter);
//   const timerEnd = Date.now();
//   return {
//     logs,
//     getLogsTime: timerEnd - timerStart,
//   };
// };

const _getTransactionTraces = async (Txs: { hash: string }[]) => {
  const timerStart = Date.now();
  let traces = (await Promise.all(
    Txs.map((tx) => fetchTransactionTrace(tx.hash))
  )) as TransactionTrace[];
  const timerEnd = Date.now();

  // remove undefined
  traces = traces.filter((trace) => trace) as TransactionTrace[];

  return {
    traces,
    getTransactionTracesTime: timerEnd - timerStart,
  };
};

const _getTransactionReceiptsFromBlock = async (block: number) => {
  const timerStart = Date.now();
  const transactionReceipts = (await syncEventsUtils.getTransactionReceiptsFromBlock(
    block
  )) as TransactionReceipt[];
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

const _saveBlockTransactions = async (blockData: BlockWithTransactions) => {
  const timerStart = Date.now();
  await syncEventsUtils.saveBlockTransactions(blockData);
  const timerEnd = Date.now();
  return timerEnd - timerStart;
};

const getBlockSyncData = async (blockData: BlockWithTransactions) => {
  const [
    { traces, getTransactionTracesTime },
    { transactionReceipts, getTransactionReceiptsTime },
    { saveBlocksTime, endSaveBlocksTime },
    saveBlockTransactionsTime,
  ] = await Promise.all([
    _getTransactionTraces(blockData.transactions),
    _getTransactionReceiptsFromBlock(blockData.number),
    _saveBlock({
      number: blockData.number,
      hash: blockData.hash,
      timestamp: blockData.timestamp,
    }),
    _saveBlockTransactions(blockData),
  ]);

  return {
    traces,
    transactionReceipts,
    getTransactionReceiptsTime,
    getTransactionTracesTime,
    saveBlocksTime,
    endSaveBlocksTime,
    saveBlockTransactionsTime,
  };
};

const saveLogsAndTraces = async (
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
  ]);

  const endTime = Date.now();

  return {
    saveLogsAndTracesTime: endTime - startTime,
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
      saveBlockTransactionsTime,
    } = await getBlockSyncData(blockData);

    const { saveLogsAndTracesTime, logs } = await saveLogsAndTraces(transactionReceipts, traces);
    const { processEventsLatencies, processLogsTime } = await processEvents(logs, blockData);

    const endSyncTime = Date.now();

    const timings = {
      transactions: {
        count: blockData.transactions.length,
        saveBlockTransactionsTime,
      },
      blocks: {
        count: 1,
        getBlockTime: endGetBlockTime - startSyncTime,
        saveBlocksTime,
        saveBlockTransactionsTime,
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
        saveLogsAndTracesTime,
      },
      logs: {
        count: logs.length,
        getTransactionReceiptsTime,
        processLogsTime,
        saveLogsAndTracesTime,
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
