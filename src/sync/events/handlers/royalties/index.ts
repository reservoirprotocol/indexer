import { logger } from "@/common/logger";
import { concat, bn } from "@/common/utils";
import { getEnhancedEventsFromTx, processEventsBatch } from "@/events-sync/handlers";
import * as fallback from "@/events-sync/handlers/royalties/core";
import { EnhancedEvent, OnChainData } from "@/events-sync/handlers/utils";
import { extractEventsBatches } from "@/events-sync/index";
import * as es from "@/events-sync/storage";
import { Royalty } from "@/utils/royalties";
import { BigNumberish } from "@ethersproject/bignumber";
import { TransactionTrace } from "@/models/transaction-traces";

const registry = new Map<string, RoyaltyAdapter>();

export type RoyaltyResult = {
  royaltyFeeBps: number;
  marketplaceFeeBps: number;
  royaltyFeeBreakdown: Royalty[];
  marketplaceFeeBreakdown: Royalty[];
  paidFullRoyalty: boolean;
};

export type TxEvent = {
  events: EnhancedEvent[];
  fillEvents: es.fills.Event[];
};

export type StateCache = {
  traces: Map<string, TransactionTrace | undefined>;
  royalties: Map<string, Royalty[]>;
  events: Map<string, TxEvent>;
};

export interface RoyaltyAdapter {
  extractRoyalties(fillEvent: es.fills.Event, cache?: boolean): Promise<RoyaltyResult | null>;
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

const subFeeWithBps = (amount: BigNumberish, totalFeeBps: number) => {
  return bn(amount).sub(bn(amount).mul(totalFeeBps).div(10000)).toString();
};

export async function getFillEventsFromTx(txHash: string) {
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

  return {
    events,
    fillEvents,
  };
}

export const checkFeeIsValid = (result: RoyaltyResult) =>
  result.marketplaceFeeBps + result.royaltyFeeBps < 10000;

export const assignRoyaltiesToFillEvents = async (
  fillEvents: es.fills.Event[],
  enableCache = true
) => {
  for (let i = 0; i < fillEvents.length; i++) {
    const fillEvent = fillEvents[i];
    const royaltyAdapter = registry.get(fillEvent.orderKind) ?? registry.get("fallback");
    try {
      if (royaltyAdapter) {
        const result = await royaltyAdapter.extractRoyalties(fillEvent, enableCache);
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

          fillEvents[i].netAmount = subFeeWithBps(
            fillEvents[i].price,
            result.royaltyFeeBps + result.marketplaceFeeBps
          );
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
