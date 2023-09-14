import { BigNumberish } from "@ethersproject/bignumber";

import * as Types from "./types";
import { lc, s, bn } from "../utils";

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

const bnslc = (value: BigNumberish) => lc(s(bn(value)));

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings
  return {
    pool: lc(s(order.pool)),
    nftIds: order.nftIds.map(bnslc),
    lpIds: order.lpIds ? order.lpIds.map(bnslc) : undefined,
    expectedTokenAmount: lc(s(bn(order.expectedTokenAmount))),
    recipient: lc(s(order.recipient)),
    swapData: lc(s(order.swapData)),
    permitterData: lc(s(order.permitterData)),
  };
};
