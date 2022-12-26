import { Royalty } from "@/utils/royalties";
import * as es from "@/events-sync/storage";
import { logger } from "@/common/logger";

import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { parseEnhancedEventsToEventsInfo } from "@/events-sync/index";
import { parseEventsInfo } from "@/events-sync/handlers";

import * as seaport from "@/events-sync/handlers/royalties/seaport";

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
  const eventsInfos = await parseEnhancedEventsToEventsInfo(enhancedEvents, false);
  const allOnChainData: OnChainData[] = [];
  for (let index = 0; index < eventsInfos.length; index++) {
    const eventsInfo = eventsInfos[index];
    const onchainData = await parseEventsInfo(eventsInfo);
    allOnChainData.push(onchainData);
  }
  return allOnChainData;
}

export const assignRoyaltiesToFillEvents = async (fillEvents: es.fills.Event[]) => {
  for (let index = 0; index < fillEvents.length; index++) {
    const fillEvent = fillEvents[index];
    const royaltyAdapter = registry.get(fillEvent.orderKind);
    try {
      if (royaltyAdapter) {
        const result = await royaltyAdapter.extractRoyalties(fillEvent);
        if (result) {
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

registry.set("seaport", seaport as RoyaltyAdapter);