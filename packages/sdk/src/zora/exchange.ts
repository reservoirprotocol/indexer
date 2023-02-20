import { Signer } from "@ethersproject/abstract-signer";
import { AddressZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

// Zora:
// - escrowed orderbook
// - fully on-chain

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(
      Addresses.Exchange[this.chainId],
      ExchangeAbi as any
    );
  }

  // --- Create order ---

  public async createOrder(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = this.createOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public createOrderTx(maker: string, order: Order): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("createAsk", [
        order.params.tokenContract,
        order.params.tokenId,
        order.params.askPrice,
        order.params.askCurrency,
        order.params.sellerFundsRecipient,
        order.params.findersFeeBps,
      ]),
    };
  }

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    order: Order,
    options?: {
      source?: string;
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
    }
  ): TxData {
    return {
      from: taker,
      to: this.contract.address,
      data:
        this.contract.interface.encodeFunctionData("fillAsk", [
          order.params.tokenContract,
          order.params.tokenId,
          order.params.askCurrency,
          order.params.askPrice,
          taker,
        ]) + generateSourceBytes(options?.source),
      value: bn(order.params.askPrice).toHexString(),
    };
  }

  // --- Cancel order ---

  public async cancelOrder(
    maker: Signer,
    order: Order
  ): Promise<ContractTransaction> {
    const tx = this.cancelOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(maker: string, order: Order): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("cancelAsk", [
        order.params.tokenContract,
        order.params.tokenId,
      ]),
    };
  }
}
