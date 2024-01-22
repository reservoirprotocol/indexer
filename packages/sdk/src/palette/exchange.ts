import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { Order } from "./order";
import { TxData, bn, generateSourceBytes } from "../utils";

import Orderbook1155Abi from "./abis/Orderbook1155.json";
import Orderbook721Abi from "./abis/Orderbook721.json";

export type MatchingOptions = {
  amount?: BigNumberish;
  tokenId?: BigNumberish;
};

export class Exchange {
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
  }

  // --- Fill multiple orders ---
  public fillERC721ListingsTx(
    taker: string,
    orders: Order[],
    options?: {
      source?: string;
    }
  ): TxData {
    const orderbook = orders[0].params.orderbook;
    const sender = taker;
    const contract = new Contract(orderbook, Orderbook721Abi);

    let price = bn(0);
    for (const order of orders) {
      price = price.add(order.params.price);
    }

    const data = contract.interface.encodeFunctionData("fillOrder", [
      orders.map((c) => c.params.tokenId!),
      orders.map((c) => c.params.price),
      true,
      "0x",
    ]);

    return {
      from: sender,
      to: contract.address,
      value: price.toString(),
      data: data + generateSourceBytes(options?.source),
    };
  }

  public fillERC1155ListingsTx(
    taker: string,
    orders: Order[],
    options?: {
      source?: string;
    }
  ): TxData {
    const orderbook = orders[0].params.orderbook;
    const sender = taker;
    const contract = new Contract(orderbook, Orderbook1155Abi);

    const tokenId = orders[0].params.tokenId!;

    let price = bn(0);
    for (const order of orders) {
      price = price.add(order.params.price);
    }

    const data = contract.interface.encodeFunctionData("fillOrder", [
      tokenId,
      orders.map((c) => c.params.price),
      true,
      "0x",
    ]);

    return {
      from: sender,
      to: contract.address,
      value: price.toString(),
      data: data + generateSourceBytes(options?.source),
    };
  }

  public acceptERC1155BidsTx(
    taker: string,
    orders: Order[],
    matchOptions: MatchingOptions[],
    options?: {
      source?: string;
    }
  ): TxData {
    const orderbook = orders[0].params.orderbook;
    const sender = taker;
    const contract = new Contract(orderbook, Orderbook721Abi);
    const tokenId = orders[0].params.tokenId!;

    const isCollectionOffer = orders[0].params.kind === "contract-wide";
    let data: string;
    if (isCollectionOffer) {
      data = contract.interface.encodeFunctionData("acceptCollectionOffer", [
        tokenId,
        orders.map((c) => c.params.price),
        true,
        "0x",
      ]);
    } else {
      data = contract.interface.encodeFunctionData("acceptHighestSpecificBids", [
        tokenId,
        orders.map((c) => c.params.price),
        true,
        "0x",
      ]);
    }
    return {
      from: sender,
      to: contract.address,
      value: "0",
      data: data + generateSourceBytes(options?.source),
    };
  }

  public acceptERC721BidsTx(
    taker: string,
    orders: Order[],
    matchOptions: MatchingOptions[],
    options?: {
      source?: string;
    }
  ): TxData {
    const orderbook = orders[0].params.orderbook;
    const sender = taker;
    const contract = new Contract(orderbook, Orderbook721Abi);
    const isCollectionOffer = orders[0].params.kind === "contract-wide";
    let data: string;
    if (isCollectionOffer) {
      data = contract.interface.encodeFunctionData("acceptCollectionOffer", [
        matchOptions.map((c) => c.tokenId!),
        orders.map((c) => c.params.price),
        true,
        "0x",
      ]);
    } else {
      data = contract.interface.encodeFunctionData("acceptHighestSpecificBids", [
        orders.map((c) => c.params.tokenId!),
        orders.map((c) => c.params.price),
        true,
        "0x",
      ]);
    }

    return {
      from: sender,
      to: contract.address,
      value: "0",
      data: data + generateSourceBytes(options?.source),
    };
  }
}
