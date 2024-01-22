import * as Types from "./types";
import { lc, n, s } from "../utils";
import { defaultAbiCoder, keccak256 } from "ethers/lib/utils";

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

  hash() {
    const { params } = this;
    if (params.side === "buy") {
      return keccak256(
        defaultAbiCoder.encode(
          ["address", "uint160", "uint256", "address", "uint96", "address"],
          [
            params.sellerOrBuyer,
            params.price,
            params.amount,
            params.referrer,
            params.feePercentage,
            params.hook,
          ]
        )
      );
    }

    return keccak256(
      defaultAbiCoder.encode(
        ["address", "uint160", "uint256", "address", "uint96", "address", "uint96", "address"],
        [
          params.sellerOrBuyer,
          params.price,
          params.amount,
          params.privateBuyer,
          params.deadline,
          params.referrer,
          params.feePercentage,
          params.hook,
        ]
      )
    );
  }
}

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    kind: order.kind,
    side: order.side,
    orderbook: lc(order.orderbook),
    collection: lc(order.collection),
    privateBuyer: order.privateBuyer ? lc(order.privateBuyer) : undefined,
    sellerOrBuyer: lc(order.sellerOrBuyer),
    referrer: lc(order.referrer),
    hook: lc(order.hook),
    tokenId: order.tokenId ? s(order.tokenId) : undefined,
    price: s(order.price),
    amount: s(order.amount),
    deadline: n(order.deadline),
    feePercentage: n(order.feePercentage),
  };
};
