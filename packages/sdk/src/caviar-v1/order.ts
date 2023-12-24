import { lc, s } from "../utils";
import * as Types from "./types";

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
    tokenId: order.tokenId ? s(order.tokenId) : order.tokenId,
    tokenAddress: order.tokenAddress ? s(order.tokenAddress) : order.tokenAddress,
    extra: {
      prices: order.extra.prices.map(s),
    },
  };
};
