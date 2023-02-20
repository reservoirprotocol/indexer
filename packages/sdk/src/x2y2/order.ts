import { defaultAbiCoder } from "@ethersproject/abi";
import { AddressZero, HashZero } from "@ethersproject/constants";

import * as Types from "./types";
import { lc, n, s } from "../utils";

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
  }

  public static fromLocalOrder(
    chainId: number,
    localOrder: Types.LocalOrder
  ): Order {
    if (localOrder.items.length !== 1) {
      throw new Error("Batch orders are no supported");
    }

    const decodedItems = defaultAbiCoder.decode(
      ["(address token, uint256 tokenId)[]"],
      localOrder.items[0].data
    );
    if (decodedItems.length !== 1) {
      throw new Error("Bundle orders are not supported");
    }

    return new Order(chainId, {
      type: localOrder.intent === Types.Intent.SELL ? "sell" : "buy",
      currency: localOrder.currency,
      price: localOrder.items[0].price,
      maker: localOrder.user,
      taker: AddressZero,
      deadline: localOrder.deadline,
      nft: {
        token: decodedItems[0][0].token,
        tokenId: decodedItems[0][0].tokenId,
      },
      // The fields below are mocked (they are only available on upstream orders)
      id: 0,
      itemHash: HashZero,
      royalty_fee: 0,
    });
  }
}

const normalize = (order: Types.Order): Types.Order => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    kind: order.kind,
    id: order.id,
    type: s(order.type),
    currency: lc(order.currency),
    price: s(order.price),
    maker: lc(order.maker),
    taker: order.taker ? lc(order.taker) : AddressZero,
    deadline: n(order.deadline),
    itemHash: lc(order.itemHash),
    nft: {
      token: lc(order.nft.token),
      tokenId:
        order.nft.tokenId !== undefined ? s(order.nft.tokenId) : undefined,
    },
    royalty_fee: order.royalty_fee ? n(order.royalty_fee) : 0,
  };
};
