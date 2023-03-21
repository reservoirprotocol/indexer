import { Signer } from "@ethersproject/abstract-signer";
import { AddressZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";
import BaazarAbi from "./abis/Baazar.json";

// SuperRare:
// - escrowed orderbook
// - fully on-chain

export class Exchange {
  public chainId: number;
  public exchange: Contract;
  public baazar: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.exchange = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
    this.baazar = new Contract(Addresses.Bazaar[this.chainId], BaazarAbi);
  }

  // --- Create order ---

  public async createOrder(maker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.createOrderTx(order);
    return maker.sendTransaction(tx);
  }

  public createOrderTx(order: Order): TxData {
    return {
      from: order.params.maker,
      to: this.baazar.address,
      data: this.baazar.interface.encodeFunctionData("setSalePrice", [
        order.params.contract,
        order.params.tokenId,
        order.params.currency,
        order.params.price,
        AddressZero,
        order.params.splitAddresses,
        order.params.splitRatios,
      ]),
    };
  }

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    order: Order,
    options?: {
      source?: string;
      nativeReferrerAddress?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(await taker.getAddress(), order, options);
    return taker.sendTransaction(tx);
  }

  public fillOrderTx(
    taker: string,
    order: Order,
    options?: {
      source?: string;
      nativeReferrerAddress?: string;
    }
  ): TxData {
    return {
      from: taker,
      to: this.baazar.address,
      data:
        this.baazar.interface.encodeFunctionData("buy", [
          order.params.contract,
          order.params.tokenId,
          order.params.currency,
          order.params.price,
        ]) + generateSourceBytes(options?.source),
      value: bn(order.params.price).add(bn(order.params.price).mul(3).div(100)).toHexString(),
    };
  }

  // --- Cancel order ---

  public async cancelOrder(maker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.cancelOrderTx(order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(order: Order): TxData {
    return {
      from: order.params.maker,
      to: this.exchange.address,
      data: this.exchange.interface.encodeFunctionData("removeSalePrice", [
        order.params.contract,
        order.params.tokenId,
        AddressZero,
      ]),
    };
  }
}
