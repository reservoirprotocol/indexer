import { Signer } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { Provider } from "@ethersproject/abstract-provider";

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
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }

  // --- Fill order ---

  public async fillOrder(
    taker: Signer,
    order: Order,
    matchParams: Types.OrderInput,
    options?: {
      noDirectTransfer?: boolean;
      referrer?: string;
    }
  ): Promise<ContractTransaction> {
    const tx = this.fillOrderTx(
      await taker.getAddress(),
      order,
      matchParams,
      options
    );
    return taker.sendTransaction(tx);
  }

  public fillOrderTx(
    taker: string,
    order: Order,
    matchOrder: Types.OrderInput,
    options?: {
      noDirectTransfer?: boolean;
      referrer?: string;
    }
  ): TxData {
    let to = this.contract.address;
    let data: string;
    let value: BigNumber | undefined;

    const isBuy = order.params.side === Types.TradeDirection.BUY;
    const executeArgs = isBuy
      ? [matchOrder, order.getRaw()]
      : [order.getRaw(), matchOrder];

    data = this.contract.interface.encodeFunctionData("execute", executeArgs);

    if (!isBuy) value = bn(order.params.price);

    return {
      from: taker,
      to,
      data: data + generateSourceBytes(options?.referrer),
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
    const data: string = this.contract.interface.encodeFunctionData(
      "cancelOrder",
      [order.getRaw().order]
    );
    return {
      from: maker,
      to: this.contract.address,
      data,
    };
  }

  // --- Get hashNonce ---
  public async getNonce(provider: Provider, user: string): Promise<BigNumber> {
    return this.contract.connect(provider).nonces(user);
  }

  // --- Increase nonce ---

  public async incrementHashNonce(maker: Signer): Promise<ContractTransaction> {
    const tx = this.incrementHashNonceTx(await maker.getAddress());
    return maker.sendTransaction(tx);
  }

  public incrementHashNonceTx(maker: string): TxData {
    const data: string = this.contract.interface.encodeFunctionData(
      "incrementNonce",
      []
    );
    return {
      from: maker,
      to: this.contract.address,
      data,
    };
  }
}
