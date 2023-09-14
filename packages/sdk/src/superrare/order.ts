import * as Types from "./types";
import { lc, s, n } from "../utils";

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

  const splitAddresses = order.splitAddresses.map((a) => lc(a));
  const splitRatios = order.splitRatios.map((r) => n(r));

  return {
    maker: lc(order.maker),
    contract: lc(order.contract),
    tokenId: s(order.tokenId),
    price: s(order.price),
    currency: s(order.currency),
    splitAddresses,
    splitRatios,
  };
};
