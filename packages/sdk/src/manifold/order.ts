import { constants } from "ethers";

import { lc, n } from "../utils";
import * as Types from "./types";

export class Order {
  public chainId: number;
  public params: Types.Order;

  constructor(chainId: number, params: Types.Order) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }

    if (this.params.details.startTime > this.params.details.endTime) {
      throw new Error("Invalid listing  start and/or expiration time");
    }
  }
}

const normalize = (order: Types.Order): Types.Order => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    ...order,
    id: order.id,
    seller: lc(order.seller),
    marketplaceBPS: n(order.marketplaceBPS || 0),
    referrerBPS: n(order.referrerBPS || 0),
    details: {
      ...order.details,
      erc20: lc(order.details.erc20 || constants.AddressZero),
      identityVerifier: lc(
        order.details.identityVerifier || constants.AddressZero
      ),
      totalAvailable: n(order.details.totalAvailable || 0),
      totalPerSale: n(order.details.totalPerSale || 0),
      minIncrementBPS: n(order.details.minIncrementBPS || 0),
    },
    token: {
      ...order.token,
      address_: lc(order.token.address_),
    },
    fees: {
      deliverFixed: order.fees.deliverFixed || 0,
      deliverBPS: order.fees.deliverBPS || 0,
    },
  };
};
