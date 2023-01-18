import { logger } from "@/common/logger";
import { concat } from "@/common/utils";
import { getEnhancedEventsFromTx, processEventsBatch } from "@/events-sync/handlers";
import * as fallback from "@/events-sync/handlers/royalties/core";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { extractEventsBatches } from "@/events-sync/index";
import * as es from "@/events-sync/storage";
import { Royalty } from "@/utils/royalties";

const registry = new Map<string, RoyaltyAdapter>();

export type RoyaltyResult = {
  royaltyFeeBps: number;
  marketplaceFeeBps: number;
  royaltyFeeBreakdown: Royalty[];
  marketplaceFeeBreakdown: Royalty[];
  paidFullRoyalty: boolean;
};

export interface RoyaltyAdapter {
  extractRoyalties(fillEvent: es.fills.Event): Promise<RoyaltyResult | null>;
}

function parseHrtimeToSeconds(hrtime: [number, number]) {
  return (hrtime[0] + hrtime[1] / 1e9).toFixed(3);
}

export async function extractOnChainData(enhancedEvents: EnhancedEvent[]) {
  const startTime = process.hrtime();

  const allOnChainData: OnChainData[] = [];

  const eventBatches = extractEventsBatches(enhancedEvents, true);
  for (const batch of eventBatches) {
    const onChainData = await processEventsBatch(batch, true);
    allOnChainData.push(onChainData);
  }

  logger.info(
    "debug",
    `Time extractOnChainData: ${parseHrtimeToSeconds(process.hrtime(startTime))}`
  );

  return allOnChainData;
}

export async function getFillEventsFromTx(txHash: string) {
  const startTime = process.hrtime();

  const events = await getEnhancedEventsFromTx(txHash);
  const allOnChainData = await extractOnChainData(events);

  let fillEvents: es.fills.Event[] = [];
  for (let i = 0; i < allOnChainData.length; i++) {
    const data = allOnChainData[i];
    const allEvents = concat(
      data.fillEvents,
      data.fillEventsPartial,
      data.fillEventsOnChain
    ).filter((e) => e.orderKind !== "mint");
    fillEvents = [...fillEvents, ...allEvents];
  }

  logger.info(
    "debug",
    `Time getFillEventsFromTx(${txHash}): ${parseHrtimeToSeconds(process.hrtime(startTime))}`
  );

  return fillEvents;
}

const checkFeeIsValid = (result: RoyaltyResult) =>
  result.marketplaceFeeBps + result.royaltyFeeBps < 10000;

export const assignRoyaltiesToFillEvents = async (fillEvents: es.fills.Event[]) => {
  for (let i = 0; i < fillEvents.length; i++) {
    const fillEvent = fillEvents[i];
    const royaltyAdapter = registry.get(fillEvent.orderKind) ?? registry.get("fallback");
    try {
      if (royaltyAdapter) {
        const result = await royaltyAdapter.extractRoyalties(fillEvent);
        if (result) {
          const isValid = checkFeeIsValid(result);
          if (!isValid) {
            throw new Error(
              `invalid royalties: marketplaceFeeBps=${result.marketplaceFeeBps}, royaltyFeeBps=${result.royaltyFeeBps}`
            );
          }

          fillEvents[i].royaltyFeeBps = result.royaltyFeeBps;
          fillEvents[i].marketplaceFeeBps = result.marketplaceFeeBps;
          fillEvents[i].royaltyFeeBreakdown = result.royaltyFeeBreakdown;
          fillEvents[i].marketplaceFeeBreakdown = result.marketplaceFeeBreakdown;
          fillEvents[i].paidFullRoyalty = result.paidFullRoyalty;
        }
      }
    } catch (error) {
      logger.error(
        "assign-royalties-to-fill-events",
        `Failed to assign royalties to fill events: ${error} kind: ${fillEvent.orderKind}`
      );
    }
  }
};

registry.set("fallback", fallback as RoyaltyAdapter);
