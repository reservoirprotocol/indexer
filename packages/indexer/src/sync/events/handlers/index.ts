import { Log } from "@ethersproject/abstract-provider";

import { logger } from "@/common/logger";
import { EventKind, getEventData } from "@/events-sync/data";
import {
  EnhancedEvent,
  OnChainData,
  initOnChainData,
  processOnChainData,
} from "@/events-sync/handlers/utils";
import * as utils from "@/events-sync/utils";

import * as erc20 from "@/events-sync/handlers/erc20";
import * as erc721 from "@/events-sync/handlers/erc721";
import * as erc1155 from "@/events-sync/handlers/erc1155";
import * as blur from "@/events-sync/handlers/blur";
import * as cryptopunks from "@/events-sync/handlers/cryptopunks";
import * as decentraland from "@/events-sync/handlers/decentraland";
import * as element from "@/events-sync/handlers/element";
import * as forward from "@/events-sync/handlers/forward";
import * as foundation from "@/events-sync/handlers/foundation";
import * as looksrare from "@/events-sync/handlers/looks-rare";
import * as nftx from "@/events-sync/handlers/nftx";
import * as nouns from "@/events-sync/handlers/nouns";
import * as quixotic from "@/events-sync/handlers/quixotic";
import * as seaport from "@/events-sync/handlers/seaport";
import * as sudoswap from "@/events-sync/handlers/sudoswap";
import * as wyvern from "@/events-sync/handlers/wyvern";
import * as x2y2 from "@/events-sync/handlers/x2y2";
import * as zeroExV4 from "@/events-sync/handlers/zeroex-v4";
import * as zora from "@/events-sync/handlers/zora";
import * as universe from "@/events-sync/handlers/universe";
import * as infinity from "@/events-sync/handlers/infinity";
import * as flow from "@/events-sync/handlers/flow";
import * as rarible from "@/events-sync/handlers/rarible";
import * as manifold from "@/events-sync/handlers/manifold";
import * as tofu from "@/events-sync/handlers/tofu";
import * as nftTrader from "@/events-sync/handlers/nft-trader";
import * as okex from "@/events-sync/handlers/okex";
import * as bendDao from "@/events-sync/handlers/bend-dao";
import * as superrare from "@/events-sync/handlers/superrare";
import * as zeroExV2 from "@/events-sync/handlers/zeroex-v2";

// A list of events having the same high-level kind
export type EventsByKind = {
  kind: EventKind;
  data: EnhancedEvent[];
};

// A batch of events to get processed together
export type EventsBatch = {
  id: string;
  events: EventsByKind[];
  backfill?: boolean;
};

// Map each high-level event kind to its corresponding handler
export const eventKindToHandler = new Map<
  EventKind,
  (e: EnhancedEvent[], d: OnChainData, backfill?: boolean) => Promise<void>
>([
  ["erc20", (e, d) => erc20.handleEvents(e, d)],
  ["erc721", (e, d) => erc721.handleEvents(e, d)],
  ["erc1155", (e, d) => erc1155.handleEvents(e, d)],
  ["blur", (e, d) => blur.handleEvents(e, d)],
  ["cryptopunks", (e, d) => cryptopunks.handleEvents(e, d)],
  ["decentraland", (e, d) => decentraland.handleEvents(e, d)],
  ["element", (e, d) => element.handleEvents(e, d)],
  ["forward", (e, d) => forward.handleEvents(e, d)],
  ["foundation", (e, d) => foundation.handleEvents(e, d)],
  ["looks-rare", (e, d) => looksrare.handleEvents(e, d)],
  ["nftx", (e, d) => nftx.handleEvents(e, d)],
  ["nouns", (e, d) => nouns.handleEvents(e, d)],
  ["quixotic", (e, d) => quixotic.handleEvents(e, d)],
  ["seaport", (e, d) => seaport.handleEvents(e, d)],
  ["sudoswap", (e, d) => sudoswap.handleEvents(e, d)],
  ["wyvern", (e, d) => wyvern.handleEvents(e, d)],
  ["x2y2", (e, d) => x2y2.handleEvents(e, d)],
  ["zeroex-v4", (e, d, b) => zeroExV4.handleEvents(e, d, b)],
  ["zora", (e, d) => zora.handleEvents(e, d)],
  ["universe", (e, d) => universe.handleEvents(e, d)],
  ["infinity", (e, d) => infinity.handleEvents(e, d)],
  ["rarible", (e, d) => rarible.handleEvents(e, d)],
  ["manifold", (e, d) => manifold.handleEvents(e, d)],
  ["tofu", (e, d) => tofu.handleEvents(e, d)],
  ["nft-trader", (e, d) => nftTrader.handleEvents(e, d)],
  ["okex", (e, d) => okex.handleEvents(e, d)],
  ["bend-dao", (e, d) => bendDao.handleEvents(e, d)],
  ["superrare", (e, d) => superrare.handleEvents(e, d)],
  ["flow", (e, d) => flow.handleEvents(e, d)],
  ["zeroex-v2", (e, d) => zeroExV2.handleEvents(e, d)],
]);

export const processEventsBatch = async (batch: EventsBatch, skipProcessing?: boolean) => {
  const onChainData = initOnChainData();
  await Promise.all(
    batch.events.map(async (events) => {
      if (events.data.length) {
        const handler = eventKindToHandler.get(events.kind);
        if (handler) {
          await handler(events.data, onChainData, batch.backfill);
        } else {
          logger.error(
            "process-events-batch",
            JSON.stringify({
              error: "missing-handler-for-event-kind",
              data: `Event kind ${events.kind} is missing a corresponding handler`,
            })
          );
        }
      }
    })
  );

  if (!skipProcessing) {
    await processOnChainData(onChainData, batch.backfill);
  }

  return onChainData;
};

export const getEventParams = (log: Log, timestamp: number) => {
  const address = log.address.toLowerCase() as string;
  const block = log.blockNumber as number;
  const blockHash = log.blockHash.toLowerCase() as string;
  const txHash = log.transactionHash.toLowerCase() as string;
  const txIndex = log.transactionIndex as number;
  const logIndex = log.logIndex as number;

  return {
    address,
    txHash,
    txIndex,
    block,
    blockHash,
    logIndex,
    timestamp,
    batchIndex: 1,
  };
};

export const getEnhancedEventsFromTx = async (txHash: string) => {
  const enhancedEvents: EnhancedEvent[] = [];

  const availableEventData = getEventData();
  const tx = await utils.fetchTransaction(txHash);
  const { logs } = await utils.fetchTransactionLogs(txHash);

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const eventData = availableEventData.find(
      ({ addresses, topic, numTopics }) =>
        log.topics[0] === topic &&
        log.topics.length === numTopics &&
        (addresses ? addresses[log.address.toLowerCase()] : true)
    );
    if (eventData) {
      enhancedEvents.push({
        kind: eventData.kind,
        subKind: eventData.subKind,
        baseEventParams: getEventParams(log, tx.blockTimestamp),
        log,
      });
    }
  }

  return enhancedEvents;
};
