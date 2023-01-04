import { logger } from "@/common/logger";
import { concat } from "@/common/utils";
import { getEnhancedEventFromTransaction, parseEventsInfo } from "@/events-sync/handlers";
import * as fallback from "@/events-sync/handlers/royalties/core";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { parseEnhancedEventsToEventsInfo } from "@/events-sync/index";
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
  extractRoyalties(fillEvent: es.fills.Event): Promise<null | RoyaltyResult>;
}

export async function parseEnhancedEventToOnChainData(enhancedEvents: EnhancedEvent[]) {
  const eventsInfos = parseEnhancedEventsToEventsInfo(enhancedEvents, false);
  const allOnChainData: OnChainData[] = [];
  for (let index = 0; index < eventsInfos.length; index++) {
    const eventsInfo = eventsInfos[index];
    const onchainData = await parseEventsInfo(eventsInfo);
    allOnChainData.push(onchainData);
  }
  return allOnChainData;
}

export async function getFillEventsFromTx(txHash: string) {
  const events = await getEnhancedEventFromTransaction(txHash);
  const allOnChainData = await parseEnhancedEventToOnChainData(events);
  let fillEvents: es.fills.Event[] = [];

  for (let index = 0; index < allOnChainData.length; index++) {
    const data = allOnChainData[index];
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
