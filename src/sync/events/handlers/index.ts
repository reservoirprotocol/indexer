import { Log } from "@ethersproject/abstract-provider";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, initOnChainData, processOnChainData } from "@/events-sync/handlers/utils";
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
import * as rarible from "@/events-sync/handlers/rarible";
import * as manifold from "@/events-sync/handlers/manifold";
import * as tofu from "@/events-sync/handlers/tofu";
import * as nftTrader from "@/events-sync/handlers/nft-trader";
import * as okex from "@/events-sync/handlers/okex";
import * as bendDao from "@/events-sync/handlers/bend-dao";
import * as superrare from "@/events-sync/handlers/superrare";

// A list of events having the same high-level kind
export type EventsByKind = {
  kind:
    | "erc20"
    | "erc721"
    | "erc1155"
    | "blur"
    | "cryptopunks"
    | "element"
    | "forward"
    | "foundation"
    | "looks-rare"
    | "nftx"
    | "nouns"
    | "quixotic"
    | "seaport"
    | "sudoswap"
    | "wyvern"
    | "x2y2"
    | "zeroex-v4"
    | "zora"
    | "universe"
    | "infinity"
    | "rarible"
    | "manifold"
    | "tofu"
    | "decentraland"
    | "nft-trader"
    | "okex"
    | "bend-dao"
    | "superrare";
  data: EnhancedEvent[];
};

// A batch of events to get processed together
export type EventsBatch = {
  id: string;
  events: EventsByKind[];
  backfill?: boolean;
};

export const processEventsBatch = async (batch: EventsBatch, skipProcessing?: boolean) => {
  const onChainData = initOnChainData();

  for (const events of batch.events) {
    switch (events.kind) {
      case "erc20": {
        await erc20.handleEvents(events.data, onChainData);
        break;
      }

      case "erc721": {
        await erc721.handleEvents(events.data, onChainData);
        break;
      }

      case "erc1155": {
        await erc1155.handleEvents(events.data, onChainData);
        break;
      }

      case "blur": {
        await blur.handleEvents(events.data, onChainData);
        break;
      }

      case "cryptopunks": {
        await cryptopunks.handleEvents(events.data, onChainData);
        break;
      }

      case "decentraland": {
        await decentraland.handleEvents(events.data, onChainData);
        break;
      }

      case "element": {
        await element.handleEvents(events.data, onChainData);
        break;
      }

      case "forward": {
        await forward.handleEvents(events.data, onChainData);
        break;
      }

      case "foundation": {
        await foundation.handleEvents(events.data, onChainData);
        break;
      }

      case "looks-rare": {
        await looksrare.handleEvents(events.data, onChainData);
        break;
      }

      case "nftx": {
        await nftx.handleEvents(events.data, onChainData);
        break;
      }

      case "nouns": {
        await nouns.handleEvents(events.data, onChainData);
        break;
      }

      case "quixotic": {
        await quixotic.handleEvents(events.data, onChainData);
        break;
      }

      case "seaport": {
        await seaport.handleEvents(events.data, onChainData);
        break;
      }

      case "sudoswap": {
        await sudoswap.handleEvents(events.data, onChainData);
        break;
      }

      case "wyvern": {
        await wyvern.handleEvents(events.data, onChainData);
        break;
      }

      case "x2y2": {
        await x2y2.handleEvents(events.data, onChainData);
        break;
      }

      case "zeroex-v4": {
        await zeroExV4.handleEvents(events.data, onChainData, batch.backfill);
        break;
      }

      case "zora": {
        await zora.handleEvents(events.data, onChainData);
        break;
      }

      case "universe": {
        await universe.handleEvents(events.data, onChainData);
        break;
      }

      case "infinity": {
        await infinity.handleEvents(events.data, onChainData);
        break;
      }

      case "rarible": {
        await rarible.handleEvents(events.data, onChainData);
        break;
      }

      case "manifold": {
        await manifold.handleEvents(events.data, onChainData);
        break;
      }

      case "tofu": {
        await tofu.handleEvents(events.data, onChainData);
        break;
      }

      case "nft-trader": {
        await nftTrader.handleEvents(events.data, onChainData);
        break;
      }

      case "okex": {
        await okex.handleEvents(events.data, onChainData);
        break;
      }

      case "bend-dao": {
        await bendDao.handleEvents(events.data, onChainData);
        break;
      }

      case "superrare": {
        await superrare.handleEvents(events.data, onChainData);
        break;
      }
    }
  }

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
        baseEventParams: getEventParams(log, tx.blockTimestamp),
        log,
      });
    }
  }

  return enhancedEvents;
};
