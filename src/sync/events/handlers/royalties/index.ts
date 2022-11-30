import { Royalty } from "@/utils/royalties";
import * as es from "@/events-sync/storage";

import { logger } from "@/common/logger";
import * as seaport from "@/events-sync/handlers/royalties/seaport";

const registry = new Map<string, RoyaltyAdapter>();

export type RoyaltyResult = {
  royalty_fee_bps: number;
  marketplace_fee_bps: number;
  royalty_fee_breakdown: Royalty[];
  marketplace_fee_breakdown: Royalty[];
  paid_full_royalty: boolean;
};

export interface RoyaltyAdapter {
  extractRoyalties(fillEvent: es.fills.Event): Promise<null | RoyaltyResult>;
}

registry.set("seaport", seaport as RoyaltyAdapter);

export const assignRoyaltiesToFillEvents = async (fillEvents: es.fills.Event[]) => {
  for (let index = 0; index < fillEvents.length; index++) {
    const fillEvent = fillEvents[index];
    const royaltyAdapter = registry.get(fillEvent.orderKind);
    try {
      if (royaltyAdapter) {
        const result = await royaltyAdapter.extractRoyalties(fillEvent);
        if (result) {
          fillEvents[index].royalty_fee_bps = result.royalty_fee_bps;
          fillEvents[index].marketplace_fee_bps = result.marketplace_fee_bps;
          fillEvents[index].royalty_fee_breakdown = result.royalty_fee_breakdown;
          fillEvents[index].marketplace_fee_breakdown = result.marketplace_fee_breakdown;
          fillEvents[index].paid_full_royalty = result.paid_full_royalty;
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
