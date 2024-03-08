import { logger } from "@/common/logger";
import { EventKind } from "@/events-sync/data";
import {
  EnhancedEvent,
  OnChainData,
  initOnChainData,
  processOnChainData,
} from "@/events-sync/handlers/utils";

import * as erc20 from "@/events-sync/handlers/erc20";
import * as erc721 from "@/events-sync/handlers/erc721";
import * as erc1155 from "@/events-sync/handlers/erc1155";
import * as blur from "@/events-sync/handlers/blur";
import * as cryptopunks from "@/events-sync/handlers/cryptopunks";
import * as decentraland from "@/events-sync/handlers/decentraland";
import * as element from "@/events-sync/handlers/element";
import * as foundation from "@/events-sync/handlers/foundation";
import * as looksrare from "@/events-sync/handlers/looks-rare";
import * as nftx from "@/events-sync/handlers/nftx";
import * as nftxV3 from "@/events-sync/handlers/nftx-v3";
import * as nouns from "@/events-sync/handlers/nouns";
import * as quixotic from "@/events-sync/handlers/quixotic";
import * as seaport from "@/events-sync/handlers/seaport";
import * as sudoswap from "@/events-sync/handlers/sudoswap";
import * as wyvern from "@/events-sync/handlers/wyvern";
import * as x2y2 from "@/events-sync/handlers/x2y2";
import * as zeroExV4 from "@/events-sync/handlers/zeroex-v4";
import * as zora from "@/events-sync/handlers/zora";
import * as rarible from "@/events-sync/handlers/rarible";
import * as manifold from "@/events-sync/handlers/manifold";
import * as tofu from "@/events-sync/handlers/tofu";
import * as nftTrader from "@/events-sync/handlers/nft-trader";
import * as okex from "@/events-sync/handlers/okex";
import * as bendDao from "@/events-sync/handlers/bend-dao";
import * as superrare from "@/events-sync/handlers/superrare";
import * as zeroExV2 from "@/events-sync/handlers/zeroex-v2";
import * as zeroExV3 from "@/events-sync/handlers/zeroex-v3";
import * as treasure from "@/events-sync/handlers/treasure";
import * as looksRareV2 from "@/events-sync/handlers/looks-rare-v2";
import * as blend from "@/events-sync/handlers/blend";
import * as sudoswapV2 from "@/events-sync/handlers/sudoswap-v2";
import * as caviarV1 from "@/events-sync/handlers/caviar-v1";
import * as paymentProcessor from "@/events-sync/handlers/payment-processor";
import * as thirdweb from "@/events-sync/handlers/thirdweb";
import * as seadrop from "@/events-sync/handlers/seadrop";
import * as blurV2 from "@/events-sync/handlers/blur-v2";
import * as erc721c from "@/events-sync/handlers/erc721c";
import * as joepeg from "@/events-sync/handlers/joepeg";
import * as metadataUpdate from "@/events-sync/handlers/metadata-update";
import * as soundxyz from "@/events-sync/handlers/soundxyz";
import * as createdotfun from "@/events-sync/handlers/createdotfun";
import * as paymentProcessorV2 from "@/events-sync/handlers/payment-processor-v2";
import * as erc721cV2 from "@/events-sync/handlers/erc721c-v2";
import * as titlesxyz from "@/events-sync/handlers/titlesxyz";
import * as artblocks from "@/events-sync/handlers/artblocks";
import * as highlightxyz from "@/events-sync/handlers/highlightxyz";
import * as ditto from "@/events-sync/handlers/ditto";
import * as mooar from "@/events-sync/handlers/mooar";
import * as fairxyz from "@/events-sync/handlers/fairxyz";
import * as operatorFilter from "@/events-sync/handlers/operator-filter";
import * as paymentProcessorV201 from "@/events-sync/handlers/payment-processor-v2.0.1";

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
  ["foundation", (e, d) => foundation.handleEvents(e, d)],
  ["looks-rare", (e, d) => looksrare.handleEvents(e, d)],
  ["nftx", (e, d) => nftx.handleEvents(e, d)],
  ["nftx-v3", (e, d) => nftxV3.handleEvents(e, d)],
  ["nouns", (e, d) => nouns.handleEvents(e, d)],
  ["quixotic", (e, d) => quixotic.handleEvents(e, d)],
  ["seaport", (e, d) => seaport.handleEvents(e, d)],
  ["sudoswap", (e, d) => sudoswap.handleEvents(e, d)],
  ["wyvern", (e, d) => wyvern.handleEvents(e, d)],
  ["x2y2", (e, d) => x2y2.handleEvents(e, d)],
  ["zeroex-v4", (e, d, b) => zeroExV4.handleEvents(e, d, b)],
  ["zora", (e, d) => zora.handleEvents(e, d)],
  ["rarible", (e, d) => rarible.handleEvents(e, d)],
  ["manifold", (e, d) => manifold.handleEvents(e, d)],
  ["tofu", (e, d) => tofu.handleEvents(e, d)],
  ["nft-trader", (e, d) => nftTrader.handleEvents(e, d)],
  ["okex", (e, d) => okex.handleEvents(e, d)],
  ["bend-dao", (e, d) => bendDao.handleEvents(e, d)],
  ["superrare", (e, d) => superrare.handleEvents(e, d)],
  ["zeroex-v2", (e, d) => zeroExV2.handleEvents(e, d)],
  ["zeroex-v3", (e, d) => zeroExV3.handleEvents(e, d)],
  ["treasure", (e, d) => treasure.handleEvents(e, d)],
  ["looks-rare-v2", (e, d) => looksRareV2.handleEvents(e, d)],
  ["sudoswap-v2", (e, d) => sudoswapV2.handleEvents(e, d)],
  ["ditto", (e) => ditto.handleEvents(e)],
  ["blend", (e, d) => blend.handleEvents(e, d)],
  ["caviar-v1", (e, d) => caviarV1.handleEvents(e, d)],
  ["payment-processor", (e, d) => paymentProcessor.handleEvents(e, d)],
  ["thirdweb", (e, d) => thirdweb.handleEvents(e, d)],
  ["seadrop", (e, d) => seadrop.handleEvents(e, d)],
  ["blur-v2", (e, d) => blurV2.handleEvents(e, d)],
  ["erc721c", (e) => erc721c.handleEvents(e)],
  ["joepeg", (e, d) => joepeg.handleEvents(e, d)],
  ["metadata-update", (e, d) => metadataUpdate.handleEvents(e, d)],
  ["soundxyz", (e, d) => soundxyz.handleEvents(e, d)],
  ["createdotfun", (e, d) => createdotfun.handleEvents(e, d)],
  ["payment-processor-v2", (e, d) => paymentProcessorV2.handleEvents(e, d)],
  ["erc721c-v2", (e) => erc721cV2.handleEvents(e)],
  ["titlesxyz", (e, d) => titlesxyz.handleEvents(e, d)],
  ["artblocks", (e, d) => artblocks.handleEvents(e, d)],
  ["mooar", (e, d) => mooar.handleEvents(e, d)],
  ["highlightxyz", (e, d) => highlightxyz.handleEvents(e, d)],
  ["fairxyz", (e, d) => fairxyz.handleEvents(e, d)],
  ["operator-filter", (e) => operatorFilter.handleEvents(e)],
  ["payment-processor-v2.0.1", (e, d) => paymentProcessorV201.handleEvents(e, d)],
]);

export const processEventsBatch = async (batch: EventsBatch, skipProcessing?: boolean) => {
  const onChainData = initOnChainData();
  await Promise.all(
    batch.events.map(async (events) => {
      if (!events.data.length) {
        return;
      }

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
    })
  );

  if (!skipProcessing) {
    await processOnChainData(onChainData, batch.backfill);
  }

  return onChainData;
};

export const processEventsBatchV2 = async (batches: EventsBatch[], backfill?: boolean) => {
  const startTime = Date.now();
  const onChainData = initOnChainData();

  const batchArray = batches.map((batch) => {
    return batch.events.map((events) => {
      return events;
    });
  });

  const flattenedArray = batchArray.flat(2);

  const startProcessLogsTime = Date.now();

  const latencies: {
    eventKind: EventKind;
    eventsCount: number;
    latency: number;
  }[] = [];

  await Promise.all(
    flattenedArray.map(async (events) => {
      const startTime = Date.now();
      if (!events.data.length) {
        return;
      }
      const handler = eventKindToHandler.get(events.kind);
      if (handler) {
        await handler(events.data, onChainData, backfill);
      } else {
        logger.error(
          "process-events-batch",
          JSON.stringify({
            error: "missing-handler-for-event-kind",
            data: `Event kind ${events.kind} is missing a corresponding handler`,
          })
        );
      }

      const endTime = Date.now();

      latencies.push({
        eventKind: events.kind,
        eventsCount: events.data.length,
        latency: endTime - startTime,
      });
    })
  );
  const endProcessLogsTime = Date.now();

  const startSaveOnChainDataTime = Date.now();
  const processOnChainLatencies = await processOnChainData(onChainData, backfill);
  const endSaveOnChainDataTime = Date.now();

  const endTime = Date.now();

  return {
    processLogsTime: endProcessLogsTime - startProcessLogsTime,
    saveOnChainDataTime: endSaveOnChainDataTime - startSaveOnChainDataTime,
    totalTime: endTime - startTime,
    latencies,
    processOnChainLatencies,
  };
};
