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

export async function extractOnChainData(enhancedEvents: EnhancedEvent[]) {
  const allOnChainData: OnChainData[] = [];

  const eventBatches = extractEventsBatches(enhancedEvents, true);
  for (const batch of eventBatches) {
    const onChainData = await processEventsBatch(batch, true);
    allOnChainData.push(onChainData);
  }

  return allOnChainData;
}

export async function getFillEventsFromTx(txHash: string) {
  const events = await getEnhancedEventsFromTx(txHash);
  const allOnChainData = await extractOnChainData(events);

  let fillEvents: es.fills.Event[] = [];
  for (let i = 0; i < allOnChainData.length; i++) {
    const data = allOnChainData[i];
    const allEvents = concat(data.fillEvents, data.fillEventsPartial, data.fillEventsOnChain);
    fillEvents = [...fillEvents, ...allEvents];
  }

  return fillEvents;
}

function checkFeeIsValid(result: RoyaltyResult) {
  return result.marketplaceFeeBps + result.royaltyFeeBps < 10000;
}

export const assignRoyaltiesToFillEvents = async (fillEvents: es.fills.Event[]) => {
  for (let index = 0; index < fillEvents.length; index++) {
    // Skip mints
    if (fillEvents[index].orderKind === "mint") {
      continue;
    }

    const fillEvent = fillEvents[index];
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
          fillEvents[index].royaltyFeeBps = result.royaltyFeeBps;
          fillEvents[index].marketplaceFeeBps = result.marketplaceFeeBps;
          fillEvents[index].royaltyFeeBreakdown = result.royaltyFeeBreakdown;
          fillEvents[index].marketplaceFeeBreakdown = result.marketplaceFeeBreakdown;
          fillEvents[index].paidFullRoyalty = result.paidFullRoyalty;
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
