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
    pool: lc(order.pool),
    tokenId: order.tokenId ? s(order.tokenId) : undefined,
    externalFilter: lc(order.externalFilter),
    acceptedSet: order.acceptedSet.map(s),
    extra: {
      prices: order.extra.prices.map(s),
    },
  };
};
