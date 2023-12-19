import { Filter } from "@ethersproject/abstract-provider";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { EventKind, getEventData } from "@/events-sync/data";
import { EventsBatch, EventsByKind, processEventsBatchV2 } from "@/events-sync/handlers";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { parseEvent } from "@/events-sync/parser";
import * as es from "@/events-sync/storage";
import * as syncEventsUtils from "@/events-sync/utils";
import * as blocksModel from "@/models/blocks";
import getUuidByString from "uuid-by-string";
import { BlockWithTransactions } from "@ethersproject/abstract-provider";

import { removeUnsyncedEventsActivitiesJob } from "@/jobs/elasticsearch/activities/remove-unsynced-events-activities-job";
import { blockCheckJob } from "@/jobs/events-sync/block-check-queue-job";
import { config } from "@/config/index";
import _ from "lodash";
import { eventsSyncRealtimeJob } from "@/jobs/events-sync/events-sync-realtime-job";
import { redis } from "@/common/redis";

export interface SyncBlockOptions {
  skipLogsCheck?: boolean;
  backfill?: boolean;
  syncDetails?:
    | {
        method: "events";
        events: string[];
      }
    | {
        method: "address";
        address: string;
      };
}
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
        kind: "sudoswap-v2",
        data: kindToEvents.get("sudoswap-v2") ?? [],
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
        kind: "payment-processor",
        data: kindToEvents.get("payment-processor") ?? [],
      },
      {
        kind: "thirdweb",
        data: kindToEvents.get("thirdweb") ?? [],
      },
      {
        kind: "seadrop",
        data: kindToEvents.get("seadrop") ?? [],
      },
      {
        kind: "blur-v2",
        data: kindToEvents.get("blur-v2") ?? [],
      },
      {
        kind: "caviar-v1",
        data: kindToEvents.get("caviar-v1") ?? [],
      },
      {
        kind: "erc721c",
        data: kindToEvents.get("erc721c") ?? [],
      },
      {
        kind: "soundxyz",
        data: kindToEvents.get("soundxyz") ?? [],
      },
      {
        kind: "createdotfun",
        data: kindToEvents.get("createdotfun") ?? [],
      },
      {
        kind: "payment-processor-v2",
        data: kindToEvents.get("payment-processor-v2") ?? [],
      },
      {
        kind: "erc721c-v2",
        data: kindToEvents.get("erc721c-v2") ?? [],
      },
      {
        kind: "titlesxyz",
        data: kindToEvents.get("titlesxyz") ?? [],
      },
      {
        kind: "artblocks",
        data: kindToEvents.get("artblocks") ?? [],
      },
      {
        kind: "ditto",
        data: kindToEvents.get("ditto") ?? [],
      },
    ];

    txHashToEventsBatch.set(txHash, {
      id: getUuidByString(`${txHash}:${logIndex}:${batchIndex}:${blockHash}`),
      events: eventsByKind,
    });
  });

  return [...txHashToEventsBatch.values()];
};

const _getLogs = async (eventFilter: Filter) => {
  const timerStart = Date.now();
  const logs = await baseProvider.getLogs(eventFilter);
  const timerEnd = Date.now();
  return {
    logs,
    getLogsTime: timerEnd - timerStart,
  };
};

const _saveBlock = async (blockData: blocksModel.Block) => {
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

export const syncTraces = async (block: number) => {
  const startSyncTime = Date.now();
  const startGetBlockTime = Date.now();
  const blockData = await syncEventsUtils.fetchBlock(block);
  if (!blockData) {
    throw new Error(`Block ${block} not found with RPC provider`);
  }

  const { traces, getTransactionTracesTime } = await syncEventsUtils._getTransactionTraces(
    blockData.transactions,
    block
  );

  const endGetBlockTime = Date.now();

  // Do what we want with traces here
  await Promise.all([syncEventsUtils.processContractAddresses(traces, blockData.timestamp)]);

  const endSyncTime = Date.now();

  logger.info(
    "sync-traces-timing",
    JSON.stringify({
      message: `Traces realtime syncing block ${block}`,
      block,
      syncTime: endSyncTime - startSyncTime,
      blockSyncTime: endSyncTime - startSyncTime,

      traces: {
        count: traces.length,
        getTransactionTracesTime,
      },
      blocks: {
        count: 1,
        getBlockTime: endGetBlockTime - startGetBlockTime,
        blockMinedTimestamp: blockData.timestamp,
        startJobTimestamp: startSyncTime,
        getBlockTimestamp: endGetBlockTime,
      },
    })
  );
};

export const getBlocks = async (fromBlock: number, toBlock: number) => {
  const blocks = await Promise.all(
    _.range(fromBlock, toBlock + 1).map(async (block) => {
      const blockData = await syncEventsUtils.fetchBlock(block);
      if (!blockData) {
        throw new Error(`Block ${block} not found with RPC provider`);
      }
      return blockData;
    })
  );

  return blocks;
};

export const syncEvents = async (
  blocks: {
    fromBlock: number;
    toBlock: number;
  },
  skipLogsCheck = false,
  syncOptions?: SyncBlockOptions
) => {
  const startSyncTime = Date.now();

  const startGetBlockTime = Date.now();
  const blockData = await getBlocks(blocks.fromBlock, blocks.toBlock);

  if (!blockData) {
    throw new Error(`Blocks ${blocks.fromBlock} to ${blocks.toBlock} not found with RPC provider`);
  }

  const endGetBlockTime = Date.now();

  const eventFilter: Filter = {
    topics: [[...new Set(getEventData().map(({ topic }) => topic))]],
    fromBlock: blocks?.fromBlock,
    toBlock: blocks?.toBlock,
  };

  if (syncOptions?.syncDetails?.method === "events") {
    // Filter to a subset of events, remove any duplicates
    eventFilter.topics = [
      [...new Set(getEventData(syncOptions.syncDetails.events).map(({ topic }) => topic))],
    ];
  } else if (syncOptions?.syncDetails?.method === "address") {
    // Filter to all events of a particular address
    eventFilter.address = syncOptions.syncDetails.address;
  }

  const availableEventData = getEventData();

  // Get the logs from the RPC
  const { logs, getLogsTime } = await _getLogs(eventFilter);

  // Check if there are transactions but no longs
  if (
    config.chainId === 137 &&
    !skipLogsCheck &&
    // check if there are transactions but no logs
    !_.isEmpty(blockData.every((block) => block.transactions.length > 0)) &&
    _.isEmpty(logs)
  ) {
    throw new Error(`No logs found for blocks ${blocks.fromBlock} to ${blocks.toBlock}`);
  }

  const saveDataTimes = await Promise.all([
    ...blockData.map(async (block) => {
      return await Promise.all([
        _saveBlock({
          number: block.number,
          hash: block.hash,
          timestamp: block.timestamp,
        }),
        _saveBlockTransactions(block),
      ]);
    }),
  ]);

  let enhancedEvents = logs
    .map((log) => {
      try {
        // const baseEventParams = parseEvent(log, blockData.timestamp);
        const block = blockData.find((b) => b.hash === log.blockHash);
        if (!block) {
          throw new Error(`Block ${log.blockHash} not found with RPC provider`);
        }
        const baseEventParams = parseEvent(log, block.timestamp);
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

  // Process the retrieved events
  const eventsBatches = extractEventsBatches(enhancedEvents as EnhancedEvent[]);

  const startProcessLogs = Date.now();

  const processEventsLatencies = await processEventsBatchV2(eventsBatches);

  const endProcessLogs = Date.now();

  const endSyncTime = Date.now();

  logger.info(
    "sync-events-timing-v2",
    JSON.stringify({
      message: `Events realtime syncing blocks ${blocks.fromBlock} to ${blocks.toBlock}`,
      blockRange: [blocks.fromBlock, blocks.toBlock],
      syncTime: endSyncTime - startSyncTime,
      // find the longest block sync time - the start sync time
      blockSyncTime: Math.max(...saveDataTimes.map((t) => t[0]?.endSaveBlocksTime)) - startSyncTime,

      logs: {
        count: logs.length,
        eventCount: enhancedEvents.length,
        getLogsTime,
        processLogs: endProcessLogs - startProcessLogs,
      },

      blocks: {
        count: 1,
        getBlockTime: endGetBlockTime - startGetBlockTime,
        saveBlocksTime: saveDataTimes.reduce((acc, t) => acc + t[0]?.saveBlocksTime, 0),
        saveBlockTransactionsTime: saveDataTimes.reduce((acc, t) => acc + t[1], 0),
        blockMinedTimestamp:
          blockData.length > 0
            ? blockData[0].timestamp
            : blockData.map((b) => {
                return {
                  number: b.number,
                  timestamp: b.timestamp,
                };
              }),
        startJobTimestamp: startSyncTime,
        getBlockTimestamp: endGetBlockTime,
      },
      transactions: {
        count: blockData.reduce((acc, b) => acc + b.transactions.length, 0),
        saveBlockTransactionsTime: saveDataTimes.reduce((acc, t) => acc + t[1], 0),
      },
      processEventsLatencies: processEventsLatencies,
    })
  );

  blockData.forEach(async (block) => {
    await blockCheckJob.addToQueue({ block: block.number, blockHash: block.hash, delay: 60 });
    await blockCheckJob.addToQueue({ block: block.number, blockHash: block.hash, delay: 60 * 5 });
  });
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
    removeUnsyncedEventsActivitiesJob.addToQueue(blockHash),
  ]);
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

  // TODO: add block hash to contracts table, and delete contracts / tokens associated to the orphaned block

  // delete the block data
  await blocksModel.deleteBlock(block, orphanedBlock.hash);
};

export const checkForMissingBlocks = async (block: number) => {
  // lets set the latest block to the block we are syncing if it is higher than the current latest block by 1. If it is higher than 1, we create a job to sync the missing blocks
  // if its lower than the current latest block, we dont update the latest block in redis, but we still sync the block (this is for when we are catching up on missed blocks, or when we are syncing a block that is older than the current latest block)
  const latestBlock = await redis.get("latest-block-realtime");

  if (latestBlock) {
    const latestBlockNumber = Number(latestBlock);
    if (block - latestBlockNumber > 1) {
      // if we are missing more than 1 block, we need to sync the missing blocks
      for (let i = latestBlockNumber + 1; i <= block; i++) {
        await eventsSyncRealtimeJob.addToQueue({ block: i });

        logger.info(
          "sync-events-realtime",
          `Found missing block: ${i} latest block ${block} latestBlock ${latestBlockNumber}`
        );
      }
    }
  } else {
    await redis.set("latest-block-realtime", block);
  }
};
