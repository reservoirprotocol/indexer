import { Provider } from "@ethersproject/abstract-provider";

import { getPoolPriceFrom0x } from "./helpers";
import * as Types from "./types";
import { lc, s } from "../utils";

export class Order {
  public chainId: number;
  public params: Types.OrderParams;

  constructor(chainId: number, params: Types.OrderParams) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }
  }

  async getQuote(count: number, slippage: number, provider: Provider, apiKey?: string) {
    const side = this.params.specificIds?.length ? "buy" : "sell";
    return getPoolPriceFrom0x(this.params.pool, count, side, slippage, provider, apiKey);
  }
}

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    vaultId: s(order.vaultId),
    pool: lc(order.pool),
    collection: lc(order.collection),
    specificIds: order.specificIds ? order.specificIds.map(s) : [],
    amounts: order.amounts ? order.amounts.map(s) : [],
    currency: s(order.currency),
    amount: s(order.amount),
    path: order.path ? order.path.map(s) : [],
    swapCallData: order.swapCallData ? lc(order.swapCallData) : undefined,
    price: s(order.price),
    extra: {
      prices: order.extra.prices.map(s),
    },
  };
};
