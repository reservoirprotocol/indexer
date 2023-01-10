import { Log } from "@ethersproject/abstract-provider";

import { getEventData } from "@/events-sync/data";
import { EnhancedEvent, OnChainData, processOnChainData } from "@/events-sync/handlers/utils";
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

export type EventsInfo = {
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
  events: EnhancedEvent[];
  backfill?: boolean;
};

export const processEvents = async (info: EventsInfo) => {
  const data = await parseEventsInfo(info);
  if (data) {
    await processOnChainData(data, info.backfill);
  }
};

export const parseEventsInfo = async (info: EventsInfo) => {
  let data: OnChainData | undefined;
  switch (info.kind) {
    case "erc20": {
      data = await erc20.handleEvents(info.events);
      break;
    }

    case "erc721": {
      data = await erc721.handleEvents(info.events);
      break;
    }

    case "erc1155": {
      data = await erc1155.handleEvents(info.events);
      break;
    }

    case "blur": {
      data = await blur.handleEvents(info.events);
      break;
    }

    case "cryptopunks": {
      data = await cryptopunks.handleEvents(info.events);
      break;
    }

    case "decentraland": {
      data = await decentraland.handleEvents(info.events);
      break;
    }

    case "element": {
      data = await element.handleEvents(info.events);
      break;
    }

    case "forward": {
      data = await forward.handleEvents(info.events);
      break;
    }

    case "foundation": {
      data = await foundation.handleEvents(info.events);
      break;
    }

    case "looks-rare": {
      data = await looksrare.handleEvents(info.events);
      break;
    }

    case "nftx": {
      data = await nftx.handleEvents(info.events);
      break;
    }

    case "nouns": {
      data = await nouns.handleEvents(info.events);
      break;
    }

    case "quixotic": {
      data = await quixotic.handleEvents(info.events);
      break;
    }

    case "seaport": {
      data = await seaport.handleEvents(info.events);
      break;
    }

    case "sudoswap": {
      data = await sudoswap.handleEvents(info.events);
      break;
    }

    case "wyvern": {
      data = await wyvern.handleEvents(info.events);
      break;
    }

    case "x2y2": {
      data = await x2y2.handleEvents(info.events);
      break;
    }

    case "zeroex-v4": {
      data = await zeroExV4.handleEvents(info.events, info.backfill);
      break;
    }

    case "zora": {
      data = await zora.handleEvents(info.events);
      break;
    }

    case "universe": {
      data = await universe.handleEvents(info.events);
      break;
    }

    case "infinity": {
      data = await infinity.handleEvents(info.events);
      break;
    }

    case "rarible": {
      data = await rarible.handleEvents(info.events);
      break;
    }

    case "manifold": {
      data = await manifold.handleEvents(info.events);
      break;
    }

    case "tofu": {
      data = await tofu.handleEvents(info.events);
      break;
    }

    case "nft-trader": {
      data = await nftTrader.handleEvents(info.events);
      break;
    }

    case "okex": {
      data = await okex.handleEvents(info.events);
      break;
    }

    case "bend-dao": {
      data = await bendDao.handleEvents(info.events);
      break;
    }

    case "superrare": {
      data = await superrare.handleEvents(info.events);
      break;
    }
  }
  return data;
};

export function getEventParams(log: Log, timestamp: number) {
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
}

export async function getEnhancedEventFromTransaction(txHash: string) {
  const enhancedEvents: EnhancedEvent[] = [];
  const availableEventData = getEventData();
  const transaction = await utils.fetchTransaction(txHash);
  const txLog = await utils.fetchTransactionLogs(txHash);
  for (let index = 0; index < txLog.logs.length; index++) {
    const log = txLog.logs[index];
    const eventData = availableEventData.find(
      ({ addresses, topic, numTopics }) =>
        log.topics[0] === topic &&
        log.topics.length === numTopics &&
        (addresses ? addresses[log.address.toLowerCase()] : true)
    );
    if (eventData) {
      enhancedEvents.push({
        kind: eventData.kind,
        baseEventParams: getEventParams(log, transaction.blockTimestamp),
        log,
      });
    }
  }
  return enhancedEvents;
}
