import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumberish } from "ethers";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import * as Types from "./types";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

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

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    makerOrder: Order,
    takerOrderParams: Types.TakerOrderParams,
    options?: {
      source?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(
      await taker.getAddress(),
      makerOrder,
      takerOrderParams,
      options
    );
    return taker.sendTransaction(tx);
  }

  public fillOrderTx(
    taker: string,
    makerOrder: Order,
    takerOrderParams: Types.TakerOrderParams,
    options?: {
      source?: string;
    }
  ): TxData {
    let data: string;
    let value: string | undefined;
    if (makerOrder.params.isOrderAsk) {
      data = this.contract.interface.encodeFunctionData(
        "matchAskWithTakerBidUsingETHAndWETH",
        [takerOrderParams, makerOrder.params]
      );
      value = makerOrder.params.price;
    } else {
      data = this.contract.interface.encodeFunctionData(
        "matchBidWithTakerAsk",
        [takerOrderParams, makerOrder.params]
      );
    }

    return {
      from: taker,
      to: this.contract.address,
      data: data + generateSourceBytes(options?.source),
      value: value && bn(value).toHexString(),
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
      data: this.contract.interface.encodeFunctionData(
        "cancelMultipleMakerOrders",
        [[order.params.nonce]]
      ),
    };
  }

  // --- Get nonce ---

  public async getNonce(
    provider: Provider,
    user: string
  ): Promise<BigNumberish> {
    return new Contract(Addresses.Exchange[this.chainId], ExchangeAbi as any)
      .connect(provider)
      .userMinOrderNonce(user);
  }
}
