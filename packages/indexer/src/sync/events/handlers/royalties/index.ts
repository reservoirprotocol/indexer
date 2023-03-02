import { BigNumberish } from "@ethersproject/bignumber";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import * as fallback from "@/events-sync/handlers/royalties/core";
import * as es from "@/events-sync/storage";
import { Royalty } from "@/utils/royalties";
import { OrderKind } from "@/orderbook/orders";

const registry = new Map<string, RoyaltyAdapter>();
registry.set("fallback", fallback as RoyaltyAdapter);

export type RoyaltyResult = {
  royaltyFeeBps: number;
  marketplaceFeeBps: number;
  royaltyFeeBreakdown: Royalty[];
  marketplaceFeeBreakdown: Royalty[];
  paidFullRoyalty: boolean;
};

export type StateCache = {
  royalties: Map<string, Royalty[]>;
};

export interface RoyaltyAdapter {
  extractRoyalties(
    fillEvent: es.fills.Event,
    cache: StateCache,
    useCache?: boolean
  ): Promise<RoyaltyResult | null>;
}

export type PartialFillEvent = {
  orderKind: OrderKind;
  contract: string;
  tokenId: string;
  currency: string;
  price: string;
  amount: string;
  maker: string;
  taker: string;
  baseEventParams: {
    txHash: string;
  };
};

export const getFillEventsFromTx = async (txHash: string): Promise<PartialFillEvent[]> => {
  const results = await idb.manyOrNone(
    `
      SELECT
        fill_events_2.order_kind,
        fill_events_2.contract,
        fill_events_2.token_id,
        fill_events_2.currency,
        fill_events_2.price,
        fill_events_2.amount,
        fill_events_2.maker,
        fill_events_2.taker
      FROM fill_events_2
      WHERE fill_events_2.tx_hash = $/txHash/
    `,
    {
      txHash: toBuffer(txHash),
    }
  );

  return (
    results
      .map((r) => ({
        orderKind: r.order_kind,
        contract: fromBuffer(r.contract),
        tokenId: r.token_id,
        currency: fromBuffer(r.currency),
        price: r.price,
        amount: r.amount,
        maker: fromBuffer(r.maker),
        taker: fromBuffer(r.taker),
        baseEventParams: {
          txHash,
        },
      }))
      // Exclude mints
      .filter((r) => r.orderKind !== "mint")
  );
};

const checkFeeIsValid = (result: RoyaltyResult) =>
  result.marketplaceFeeBps + result.royaltyFeeBps < 10000;

const subFeeWithBps = (amount: BigNumberish, totalFeeBps: number) => {
  return bn(amount).sub(bn(amount).mul(totalFeeBps).div(10000)).toString();
};

export const assignRoyaltiesToFillEvents = async (
  fillEvents: es.fills.Event[],
  enableCache = true
) => {
  const cache: StateCache = {
    royalties: new Map(),
  };

  for (let i = 0; i < fillEvents.length; i++) {
    const fillEvent = fillEvents[i];

    // Exclude mints
    if (fillEvent.orderKind === "mint") {
      continue;
    }

    const royaltyAdapter = registry.get(fillEvent.orderKind) ?? registry.get("fallback");
    try {
      if (royaltyAdapter) {
        const result = await royaltyAdapter.extractRoyalties(fillEvent, cache, enableCache);
        if (result) {
          const isValid = checkFeeIsValid(result);
          if (!isValid) {
            continue;
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
        JSON.stringify({
          error,
          fillEvent,
        })
      );
    }
  }
};
