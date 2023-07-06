import { _TypedDataEncoder } from "@ethersproject/hash";
import * as Types from "./types";
import { lc, n, s } from "../utils";

export class Order {
  public chainId: number;
  public params: Types.BaseOrder;

  constructor(chainId: number, params: Types.BaseOrder) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }
  }

  public hash() {
    return _TypedDataEncoder.hashStruct("Order", ORDER_EIP712_TYPES, this.params);
  }
}

const ORDER_EIP712_TYPES = {
  Order: [
    { name: "trader", type: "address" },
    { name: "collection", type: "address" },
    { name: "listingsRoot", type: "bytes32" },
    { name: "numberOfListings", type: "uint256" },
    { name: "expirationTime", type: "uint256" },
    { name: "assetType", type: "uint8" },
    { name: "makerFee", type: "FeeRate" },
    { name: "salt", type: "uint256" },
    { name: "orderType", type: "uint8" },
    { name: "nonce", type: "uint256" },
  ],
  FeeRate: [
    { name: "rate", type: "uint16" },
    { name: "recipient", type: "address" },
  ],
};

const normalize = (order: Types.BaseOrder): Types.BaseOrder => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    trader: lc(order.trader),
    collection: lc(order.collection),
    listingsRoot: lc(order.listingsRoot),
    numberOfListings: s(order.numberOfListings),
    expirationTime: s(order.expirationTime),
    assetType: n(order.assetType),
    makerFee: {
      rate: n(order.makerFee.rate),
      recipient: lc(order.makerFee.recipient),
    },
    salt: s(order.salt),
    orderType: n(order.orderType),
    nonce: s(order.nonce),
  };
};
