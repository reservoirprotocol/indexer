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
    price: s(order.price),
    extra: {
      prices: order.extra.prices.map(s),
    }
  };
};
