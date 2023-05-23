import { Filter } from "@ethersproject/abstract-provider";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { EventKind, getEventData } from "@/events-sync/data";
import { EventsBatch, EventsByKind, processEventsBatch } from "@/events-sync/handlers";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { parseEvent } from "@/events-sync/parserV2";
import * as es from "@/events-sync/storage";
import * as syncEventsUtils from "@/events-sync/utilsV2";
import * as blocksModel from "@/models/blocks";
import getUuidByString from "uuid-by-string";

import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";

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

    for (const event of events) {
      if (!kindToEvents.has(event.kind)) {
        kindToEvents.set(event.kind, []);
      }

      if (!blockHash) {
        blockHash = event.baseEventParams.blockHash;
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
    ];

    txHashToEventsBatch.set(txHash, {
      id: getUuidByString(`${txHash}:${blockHash}`),
      events: eventsByKind,
    });
  });

  return [...txHashToEventsBatch.values()];
};

export const syncEvents = async (block: number) => {
  try {
    logger.info("sync-events-v2", `Events realtime syncing block ${block}`);
    const startSyncTime = Date.now();

    const startGetBlockTime = Date.now();
    const blockData = await syncEventsUtils.fetchBlock(block);
    if (!blockData) {
      logger.warn("sync-events-v2", `Block ${block} not found`);
      throw new Error(`Block ${block} not found`);
    }
    const endGetBlockTime = Date.now();

    const eventFilter: Filter = {
      topics: [[...new Set(getEventData().map(({ topic }) => topic))]],
      fromBlock: block,
      toBlock: block + 1,
    };
    const availableEventData = getEventData();

    const startProcessLogsAndSaveDataTime = Date.now();
    const [logs] = await Promise.all([
      baseProvider.getLogs(eventFilter),
      blocksModel.saveBlock({
        number: block,
        hash: blockData.hash,
        timestamp: blockData.timestamp,
      }),
      syncEventsUtils.saveBlockTransactions(blockData),
    ]);

    const endProcessLogsAndSaveDataTime = Date.now();

    let enhancedEvents = logs.map((log) => {
      try {
        const baseEventParams = parseEvent(log, blockData.timestamp);

        const eventData = availableEventData.find(
          ({ addresses, numTopics, topic }) =>
            log.topics[0] === topic &&
            log.topics.length === numTopics &&
            (addresses ? addresses[log.address.toLowerCase()] : true)
        );
        if (eventData) {
          return {
            kind: eventData.kind,
            subKind: eventData.subKind,
            baseEventParams,
            log,
          };
        }
      } catch (error) {
        logger.error("sync-events-v2", `Failed to handle events: ${error}`);
        throw error;
      }
    });

    enhancedEvents = enhancedEvents.filter((e) => e) as EnhancedEvent[];

    logger.info(
      "sync-events-v2",
      `Events realtime syncing block ${block} - ${enhancedEvents.length} events`
    );
    // Process the retrieved events
    const eventsBatches = extractEventsBatches(enhancedEvents as EnhancedEvent[]);

    logger.info(
      "sync-events-v2",
      `Events realtime syncing block ${block} - ${eventsBatches.length} batches`
    );

    const startProcessEventBatchesTime = Date.now();
    await Promise.all(
      eventsBatches.map(async (eventsBatch) => {
        await processEventsBatch(eventsBatch, false);
      })
    );

    const endProcessEventBatchesTime = Date.now();

    const endSyncTime = Date.now();

    logger.info(
      "sync-events-timing-v2",
      JSON.stringify({
        message: `Events realtime syncing block ${block}`,
        block,
        syncTime: endSyncTime - startSyncTime,
        blockSyncTime: endProcessLogsAndSaveDataTime - startSyncTime,
        getBlockTime: endGetBlockTime - startGetBlockTime,
        processLogsAndSaveDataTime: endProcessLogsAndSaveDataTime - startProcessLogsAndSaveDataTime,
        processEventBatchesTime: endProcessEventBatchesTime - startProcessEventBatchesTime,
      })
    );
  } catch (error) {
    logger.error("sync-events-v2", `Events realtime syncing failed: ${error}, block: ${block}`);
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
