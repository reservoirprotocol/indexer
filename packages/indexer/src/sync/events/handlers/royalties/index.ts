import { BigNumberish } from "@ethersproject/bignumber";
import pLimit from "p-limit";

import { logger } from "@/common/logger";
import { idb, redb } from "@/common/db";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import * as fallback from "@/events-sync/handlers/royalties/core";
import * as es from "@/events-sync/storage";
import { OrderKind } from "@/orderbook/orders";
import { Royalty } from "@/utils/royalties";

const registry = new Map<string, RoyaltyAdapter>();
registry.set("fallback", fallback as RoyaltyAdapter);

export type RoyaltyResult = {
  royaltyFeeBps: number;
  marketplaceFeeBps: number;
  royaltyFeeBreakdown: Royalty[];
  marketplaceFeeBreakdown: Royalty[];
  paidFullRoyalty: boolean;
};

type FeeBreakdown = {
  kind: string;
  recipient: string;
  bps: number;
};

type OrderInfo = {
  orderId: string;
  feeBps: number;
  feeBreakdown: FeeBreakdown[];
};

export type StateCache = {
  royalties: Map<string, Royalty[][]>;
  orderInfos: Map<string, OrderInfo>;
  order: Map<string, number>;
};

export interface RoyaltyAdapter {
  extractRoyalties(
    fillEvent: es.fills.Event,
    cache: StateCache,
    useCache?: boolean,
    forceOnChain?: boolean
  ): Promise<RoyaltyResult | null>;
}

export type PartialFillEvent = {
  orderId?: string;
  orderKind: OrderKind;
  orderSide: string;
  contract: string;
  tokenId: string;
  currency: string;
  price: string;
  currencyPrice?: string;
  amount: string;
  maker: string;
  taker: string;
  baseEventParams: {
    txHash: string;
    logIndex: number;
  };
};

export const getFillEventsFromTx = async (txHash: string): Promise<PartialFillEvent[]> => {
  const results = await idb.manyOrNone(
    `
      SELECT
        fill_events_2.order_id,
        fill_events_2.order_kind,
        fill_events_2.order_side,
        fill_events_2.contract,
        fill_events_2.token_id,
        fill_events_2.currency,
        fill_events_2.price,
        fill_events_2.currency_price,
        fill_events_2.amount,
        fill_events_2.maker,
        fill_events_2.taker,
        fill_events_2.log_index
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
        orderId: r.order_id,
        orderKind: r.order_kind,
        orderSide: r.order_side,
        contract: fromBuffer(r.contract),
        tokenId: r.token_id,
        currency: fromBuffer(r.currency),
        currencyPrice: r.currency_price,
        price: r.price,
        amount: r.amount,
        maker: fromBuffer(r.maker),
        taker: fromBuffer(r.taker),
        baseEventParams: {
          txHash,
          logIndex: r.log_index,
        },
      }))
      // Exclude mints
      .filter((r) => r.orderKind !== "mint")
  );
};

export const getOrderInfos = async (orderIds: string[]): Promise<OrderInfo[]> => {
  if (!orderIds.length) {
    return [];
  }

  const results = await redb.manyOrNone(
    `
      SELECT
        orders.id,
        orders.fee_bps,
        orders.fee_breakdown
      FROM orders
      WHERE orders.id IN ($/orderIds:csv/)
    `,
    {
      orderIds,
    }
  );

  return results.map((r) => ({
    orderId: r.id,
    feeBps: r.fee_bps,
    feeBreakdown: r.fee_breakdown,
  }));
};

const checkFeeIsValid = (result: RoyaltyResult) =>
  result.marketplaceFeeBps + result.royaltyFeeBps < 10000;

const subFeeWithBps = (amount: BigNumberish, totalFeeBps: number) => {
  return bn(amount).sub(bn(amount).mul(totalFeeBps).div(10000)).toString();
};

export const assignRoyaltiesToFillEvents = async (
  fillEvents: es.fills.Event[],
  enableCache = true,
  forceOnChain = false
) => {
  const cache: StateCache = {
    royalties: new Map(),
    orderInfos: new Map(),
    order: new Map(),
  };

  const limit = pLimit(50);
  await Promise.all(
    fillEvents.map((fillEvent) =>
      limit(async () => {
        // Exclude mints
        if (fillEvent.orderKind === "mint") {
          return;
        }

        const royaltyAdapter = registry.get(fillEvent.orderKind) ?? registry.get("fallback");
        try {
          if (royaltyAdapter) {
            const result = await royaltyAdapter.extractRoyalties(
              fillEvent,
              cache,
              enableCache,
              forceOnChain
            );
            if (result) {
              const isValid = checkFeeIsValid(result);
              if (!isValid) {
                return;
              }

              fillEvent.royaltyFeeBps = result.royaltyFeeBps;
              fillEvent.marketplaceFeeBps = result.marketplaceFeeBps;
              fillEvent.royaltyFeeBreakdown = result.royaltyFeeBreakdown;
              fillEvent.marketplaceFeeBreakdown = result.marketplaceFeeBreakdown;
              fillEvent.paidFullRoyalty = result.paidFullRoyalty;

              fillEvent.netAmount = subFeeWithBps(
                fillEvent.currencyPrice ?? fillEvent.price,
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
      })
    )
  );
};
