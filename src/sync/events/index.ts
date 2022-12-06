import { Filter } from "@ethersproject/abstract-provider";
import _ from "lodash";
import pLimit from "p-limit";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { getNetworkSettings } from "@/config/network";
import { EventDataKind, getEventData } from "@/events-sync/data";
import { EnhancedEvent } from "@/events-sync/handlers/utils";
import { parseEvent } from "@/events-sync/parser";
import * as es from "@/events-sync/storage";
import * as syncEventsUtils from "@/events-sync/utils";
import * as blocksModel from "@/models/blocks";

import * as removeUnsyncedEventsActivities from "@/jobs/activities/remove-unsynced-events-activities";
import * as blockCheck from "@/jobs/events-sync/block-check-queue";
import * as eventsSyncBackfillProcess from "@/jobs/events-sync/process/backfill";
import * as eventsSyncRealtimeProcess from "@/jobs/events-sync/process/realtime";

export const syncEvents = async (
  fromBlock: number,
  toBlock: number,
  options?: {
    // When backfilling, certain processes will be disabled
    backfill?: boolean;
    syncDetails:
      | {
          method: "events";
          events: EventDataKind[];
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
  const backfill = Boolean(options?.backfill);

  // Cache the blocks for efficiency
  const blocksCache = new Map<number, blocksModel.Block>();
  // Keep track of all handled `${block}-${blockHash}` pairs
  const blocksSet = new Set<string>();

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
  // - fetch a subset of all events
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
        // - matching addresses
        const eventData = availableEventData.find(
          ({ addresses, topic, numTopics }) =>
            log.topics[0] === topic &&
            log.topics.length === numTopics &&
            (addresses ? addresses[log.address.toLowerCase()] : true)
        );
        if (eventData) {
          enhancedEvents.push({
            kind: eventData.kind,
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
    const eventsSyncProcess = backfill ? eventsSyncBackfillProcess : eventsSyncRealtimeProcess;
    await eventsSyncProcess.addToQueue([
      {
        kind: "erc20",
        events: enhancedEvents.filter(
          ({ kind }) => kind.startsWith("erc20") || kind.startsWith("weth")
        ),
        backfill,
      },
      {
        kind: "erc721",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("erc721")),
        backfill,
      },
      {
        kind: "erc1155",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("erc1155")),
        backfill,
      },
      {
        kind: "blur",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("blur")),
        backfill,
      },
      {
        kind: "cryptopunks",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("cryptopunks")),
        backfill,
      },
      {
        kind: "cryptokitties",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("cryptokitties")),
        backfill,
      },
      {
        kind: "element",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("element")),
        backfill,
      },
      {
        kind: "forward",
        events: enhancedEvents.filter(
          ({ kind }) =>
            kind.startsWith("forward") ||
            // To properly validate bids, we need some additional events
            kind === "erc20-transfer"
        ),
      },
      {
        kind: "foundation",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("foundation")),
        backfill,
      },
      {
        kind: "looks-rare",
        events: enhancedEvents.filter(
          ({ kind }) =>
            kind.startsWith("looks-rare") ||
            // To properly validate bids, we need some additional events
            kind === "erc20-transfer"
        ),
        backfill,
      },
      {
        kind: "nftx",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("nftx")),
        backfill,
      },
      {
        kind: "nouns",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("nouns")),
        backfill,
      },
      {
        kind: "quixotic",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("quixotic")),
        backfill,
      },
      {
        kind: "seaport",
        events: enhancedEvents.filter(
          ({ kind }) =>
            kind.startsWith("seaport") ||
            // To properly validate bids, we need some additional events
            kind === "erc20-transfer"
        ),
        backfill,
      },
      {
        kind: "sudoswap",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("sudoswap")),
        backfill,
      },
      {
        kind: "wyvern",
        events: enhancedEvents.filter(
          ({ kind }) =>
            kind.startsWith("wyvern") ||
            // To properly handle Wyvern sales, we need some additional events
            kind === "erc721-transfer" ||
            kind === "erc1155-transfer-single" ||
            kind === "erc20-transfer"
        ),
        backfill,
      },
      {
        kind: "x2y2",
        events: enhancedEvents.filter(
          ({ kind }) =>
            kind.startsWith("x2y2") ||
            // To properly validate bids, we need some additional events
            kind === "erc20-transfer"
        ),
        backfill,
      },
      {
        kind: "zeroex-v4",
        events: enhancedEvents.filter(
          ({ kind }) =>
            kind.startsWith("zeroex-v4") ||
            // To properly validate bids, we need some additional events
            kind === "erc20-transfer"
        ),
        backfill,
      },
      {
        kind: "zora",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("zora")),
        backfill,
      },
      {
        kind: "universe",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("universe")),
        backfill,
      },
      {
        kind: "rarible",
        events: enhancedEvents.filter(
          ({ kind }) =>
            kind.startsWith("rarible") ||
            // To properly validate bids, we need some additional events
            kind === "erc20-transfer"
        ),
      },
      {
        kind: "manifold",
        events: enhancedEvents.filter(({ kind }) => kind.startsWith("manifold")),
        backfill,
      },
    ]);

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

      // Put all fetched blocks on a delayed queue
      await Promise.all(
        [...blocksSet.values()].map(async (blockData) => {
          const block = Number(blockData.split("-")[0]);
          const blockHash = blockData.split("-")[1];

          return Promise.all(
            ns.reorgCheckFrequency.map((frequency) =>
              blockCheck.addToQueue(block, blockHash, frequency * 60)
            )
          );
        })
      );
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
