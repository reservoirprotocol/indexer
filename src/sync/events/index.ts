import { Filter } from "@ethersproject/abstract-provider";
import _ from "lodash";
import pLimit from "p-limit";

import { logger } from "@/common/logger";
import { getNetworkSettings } from "@/config/network";
import { baseProvider } from "@/common/provider";
import { EventKind, getEventData } from "@/events-sync/data";
import { EventsBatch, EventsByKind } from "@/events-sync/handlers";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { parseEvent } from "@/events-sync/parser";
import * as es from "@/events-sync/storage";
import * as syncEventsUtils from "@/events-sync/utils";
import * as blocksModel from "@/models/blocks";

import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";
import * as blockCheck from "@/jobs/events-sync/block-check-queue";
import * as eventsSyncBackfillProcess from "@/jobs/events-sync/process/backfill";
import * as eventsSyncRealtimeProcess from "@/jobs/events-sync/process/realtime";
import { BlocksToCheck } from "@/jobs/events-sync/block-check-queue";

export const extractEventsBatches = async (
  enhancedEvents: EnhancedEvent[],
  backfill: boolean
): Promise<EventsBatch[]> => {
  const limit = pLimit(50);

  // First, associate each event to its corresponding tx
  const txHashToEvents = new Map<string, EnhancedEvent[]>();
  await Promise.all(
    enhancedEvents.map((event) =>
      limit(() => {
        const txHash = event.baseEventParams.txHash;
        if (!txHashToEvents.has(txHash)) {
          txHashToEvents.set(txHash, []);
        }
        txHashToEvents.get(txHash)!.push(event);
      })
    )
  );

  // Then, for each tx split the events by their kind
  const txHashToEventsBatch = new Map<string, EventsBatch>();
  await Promise.all(
    [...txHashToEvents.entries()].map(([txHash, events]) =>
      limit(() => {
        const kindToEvents = new Map<EventKind, EnhancedEvent[]>();
        for (const event of events) {
          if (!kindToEvents.has(event.kind)) {
            kindToEvents.set(event.kind, []);
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
            kind: "forward",
            data: kindToEvents.has("forward")
              ? [
                  ...kindToEvents.get("forward")!,
                  // To properly validate bids, we need some additional events
                  ...events.filter((e) => e.subKind === "erc20-transfer"),
                ]
              : [],
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
            kind: "infinity",
            data: kindToEvents.has("infinity")
              ? [
                  ...kindToEvents.get("infinity")!,
                  // To properly validate bids, we need some additional events
                  ...events.filter((e) => e.subKind === "erc20-transfer"),
                ]
              : [],
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
        ];

        txHashToEventsBatch.set(txHash, {
          id: txHash,
          events: eventsByKind,
          backfill,
        });
      })
    )
  );

  return [...txHashToEventsBatch.values()];
};

export const syncEvents = async (
  fromBlock: number,
  toBlock: number,
  options?: {
    // When backfilling, certain processes will be disabled
    backfill?: boolean;
    syncDetails:
      | {
          method: "events";
          events: string[];
        }
      | {
          method: "address";
          // By default, ethers doesn't support filtering by multiple addresses.
          // A workaround for that is included in the V2 indexer, but for now we
          // simply skip it since there aren't many use-cases for filtering that
          // includes multiple addresses:
          // https://github.com/reservoirprotocol/indexer-v2/blob/main/src/syncer/base/index.ts
          address: string;
        };
  }
) => {
  // Cache the blocks for efficiency
  const blocksCache = new Map<number, blocksModel.Block>();
  // Keep track of all handled `${block}-${blockHash}` pairs
  const blocksSet = new Set<string>();

  const backfill = Boolean(options?.backfill);

  // If the block range we're trying to sync is small enough, then fetch everything
  // related to every of those blocks a priori for efficiency. Otherwise, it can be
  // too inefficient to do it and in this case we just proceed (and let any further
  // processes fetch those blocks as needed / if needed).
  if (!backfill && toBlock - fromBlock + 1 <= 32) {
    const limit = pLimit(32);
    await Promise.all(
      _.range(fromBlock, toBlock + 1).map((block) => limit(() => syncEventsUtils.fetchBlock(block)))
    );
  }

  // Generate the events filter with one of the following options:
  // - fetch all events
  // - fetch a subset of events
  // - fetch all events from a particular address

  // By default, we want to get all events
  let eventFilter: Filter = {
    topics: [[...new Set(getEventData().map(({ topic }) => topic))]],
    fromBlock,
    toBlock,
  };
  if (options?.syncDetails?.method === "events") {
    // Filter to a subset of events
    eventFilter = {
      // Remove any duplicate topics
      topics: [[...new Set(getEventData(options.syncDetails.events).map(({ topic }) => topic))]],
      fromBlock,
      toBlock,
    };
  } else if (options?.syncDetails?.method === "address") {
    // Filter to all events of a particular address
    eventFilter = {
      address: options.syncDetails.address,
      fromBlock,
      toBlock,
    };
  }

  const enhancedEvents: EnhancedEvent[] = [];
  await baseProvider.getLogs(eventFilter).then(async (logs) => {
    const availableEventData = getEventData();

    for (const log of logs) {
      try {
        const baseEventParams = await parseEvent(log, blocksCache);

        // Cache the block data
        if (!blocksCache.has(baseEventParams.block)) {
          // It's very important from a performance perspective to have
          // the block data available before proceeding with the events
          // (otherwise we might have to perform too many db reads)
          blocksCache.set(
            baseEventParams.block,
            await blocksModel.saveBlock({
              number: baseEventParams.block,
              hash: baseEventParams.blockHash,
              timestamp: baseEventParams.timestamp,
            })
          );
        }

        // Keep track of the block
        blocksSet.add(`${log.blockNumber}-${log.blockHash}`);

        // Find first matching event:
        // - matching topic
        // - matching number of topics (eg. indexed fields)
        // - matching address
        const eventData = availableEventData.find(
          ({ addresses, numTopics, topic }) =>
            log.topics[0] === topic &&
            log.topics.length === numTopics &&
            (addresses ? addresses[log.address.toLowerCase()] : true)
        );
        if (eventData) {
          enhancedEvents.push({
            kind: eventData.kind,
            subKind: eventData.subKind,
            baseEventParams,
            log,
          });
        }
      } catch (error) {
        logger.info("sync-events", `Failed to handle events: ${error}`);
        throw error;
      }
    }

    // Process the retrieved events asynchronously
    const eventsBatches = await extractEventsBatches(enhancedEvents, backfill);
    const eventsSyncProcess = backfill ? eventsSyncBackfillProcess : eventsSyncRealtimeProcess;
    await eventsSyncProcess.addToQueue(eventsBatches);

    // Make sure to recheck the ingested blocks with a delay in order to undo any reorgs
    const ns = getNetworkSettings();
    if (!backfill && ns.enableReorgCheck) {
      for (const blockData of blocksSet.values()) {
        const block = Number(blockData.split("-")[0]);
        const blockHash = blockData.split("-")[1];

        // Act right away if the current block is a duplicate
        if ((await blocksModel.getBlocks(block)).length > 1) {
          await blockCheck.addToQueue(block, blockHash, 10);
          await blockCheck.addToQueue(block, blockHash, 30);
        }
      }

      const blocksToCheck: BlocksToCheck[] = [];

      // Put all fetched blocks on a delayed queue
      [...blocksSet.values()].map(async (blockData) => {
        const block = Number(blockData.split("-")[0]);
        const blockHash = blockData.split("-")[1];

        ns.reorgCheckFrequency.map((frequency) =>
          blocksToCheck.push({
            block,
            blockHash,
            delay: frequency * 60,
          })
        );
      });

      await blockCheck.addBulk(blocksToCheck);
    }
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
    removeUnsyncedEventsActivities.addToQueue(blockHash),
  ]);
};
