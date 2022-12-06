import { EnhancedEvent, OnChainData, processOnChainData } from "@/events-sync/handlers/utils";

import * as erc20 from "@/events-sync/handlers/erc20";
import * as erc721 from "@/events-sync/handlers/erc721";
import * as erc1155 from "@/events-sync/handlers/erc1155";
import * as blur from "@/events-sync/handlers/blur";
import * as cryptopunks from "@/events-sync/handlers/cryptopunks";
import * as cryptokitties from "@/events-sync/handlers/cryptokitties";
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
import * as rarible from "@/events-sync/handlers/rarible";
import * as manifold from "@/events-sync/handlers/manifold";

export type EventsInfo = {
  kind:
    | "erc20"
    | "erc721"
    | "erc1155"
    | "blur"
    | "cryptopunks"
    | "cryptokitties"
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
    | "rarible"
    | "manifold";
  events: EnhancedEvent[];
  backfill?: boolean;
};

export const processEvents = async (info: EventsInfo) => {
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

    case "cryptokitties": {
      data = await cryptokitties.handleEvents(info.events);
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

    case "rarible": {
      data = await rarible.handleEvents(info.events);
      break;
    }
    case "manifold": {
      data = await manifold.handleEvents(info.events);
      break;
    }
  }

  if (data) {
    await processOnChainData(data, info.backfill);
  }
};
