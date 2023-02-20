import { Signer } from "@ethersproject/abstract-signer";
import { AddressZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

// Foundation:
// - escrowed orderbook
// - fully on-chain

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }

  // --- Create order ---

  public async createOrder(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = this.createOrderTx(order);
    return maker.sendTransaction(tx);
  }

  public createOrderTx(order: Order): TxData {
    return {
      from: order.params.maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("setBuyPrice", [
        order.params.contract,
        order.params.tokenId,
        order.params.price,
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
      to: this.contract.address,
      data:
        this.contract.interface.encodeFunctionData("buyV2", [
          order.params.contract,
          order.params.tokenId,
          order.params.price,
          options?.nativeReferrerAddress ?? AddressZero,
        ]) + generateSourceBytes(options?.source),
      value: bn(order.params.price).toHexString(),
    };
  }

  // --- Cancel order ---

  public async cancelOrder(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = this.cancelOrderTx(order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(order: Order): TxData {
    return {
      from: order.params.maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("cancelBuyPrice", [
        order.params.contract,
        order.params.tokenId,
      ]),
    };
  }
}
