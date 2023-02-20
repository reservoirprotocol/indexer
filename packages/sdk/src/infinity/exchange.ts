import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import * as Types from "./types";
import { Order } from "./order";
import * as CommonAddresses from "../common/addresses";

import ExchangeAbi from "./abis/Exchange.json";
import { Signer } from "ethers";
import { bn, lc, TxData } from "../utils";

export class Exchange {
  public chainId: number;
  public contract: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
  }

  // --- Take Orders ---

  public async takeOrders(
    taker: Signer,
    orders: Types.TakeOrderParams
  ): Promise<ContractTransaction>;
  public async takeOrders(
    taker: Signer,
    orders: Types.TakeOrderParams[]
  ): Promise<ContractTransaction>;
  public async takeOrders(
    taker: Signer,
    orders: Types.TakeOrderParams | Types.TakeOrderParams[]
  ): Promise<ContractTransaction> {
    const takerAddress = lc(await taker.getAddress());
    if (!Array.isArray(orders)) {
      orders = [orders];
    }
    const tx = this.takeOrdersTx(takerAddress, orders);
    return taker.sendTransaction(tx);
  }

  public takeOrdersTx(taker: string, orders: Types.TakeOrderParams[]): TxData {
    this.checkOrders(
      taker,
      orders.map((item) => item.order)
    );

    const orderData = [
      orders.map((item) => item.order.getSignedOrder()),
      orders.map((item) => item.tokens),
    ];

    const commonTxData = {
      from: taker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("takeOrders", orderData),
    };

    if (orders[0].order.currency === CommonAddresses.Eth[this.chainId]) {
      const value = orders.reduce((acc, { order }) => {
        return acc.add(order.getMatchingPrice());
      }, bn(0));

      return {
        ...commonTxData,
        value: value.toHexString(),
      };
    }
    return commonTxData;
  }

  // --- Take Multiple One Orders ---
  public async takeMultipleOneOrders(
    taker: Signer,
    order: Order
  ): Promise<ContractTransaction>;
  public async takeMultipleOneOrders(
    taker: Signer,
    orders: Order[]
  ): Promise<ContractTransaction>;
  public async takeMultipleOneOrders(
    taker: Signer,
    orders: Order | Order[]
  ): Promise<ContractTransaction> {
    const takerAddress = lc(await taker.getAddress());
    if (!Array.isArray(orders)) {
      orders = [orders];
    }
    const tx = this.takeMultipleOneOrdersTx(takerAddress, orders);
    return taker.sendTransaction(tx);
  }

  public takeMultipleOneOrdersTx(taker: string, orders: Order[]): TxData {
    this.checkOrders(taker, orders);

    const commonTxData = {
      from: taker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData(
        "takeMultipleOneOrders",
        [orders.map((item) => item.getSignedOrder())]
      ),
    };

    if (orders[0].currency === CommonAddresses.Eth[this.chainId]) {
      const value = orders.reduce((acc, order) => {
        return acc.add(order.getMatchingPrice());
      }, bn(0));

      return {
        ...commonTxData,
        value: value.toHexString(),
      };
    }
    return commonTxData;
  }

  // --- Cancel Multiple Orders ---

  public async cancelMultipleOrders(
    signer: Signer,
    orderNonce: string
  ): Promise<ContractTransaction>;
  public async cancelMultipleOrders(
    signer: Signer,
    orderNonces: string[]
  ): Promise<ContractTransaction>;
  public async cancelMultipleOrders(
    signer: Signer,
    orderNonces: string | string[]
  ): Promise<ContractTransaction> {
    if (!Array.isArray(orderNonces)) {
      orderNonces = [orderNonces];
    }
    const signerAddress = lc(await signer.getAddress());
    const tx = this.cancelMultipleOrdersTx(signerAddress, orderNonces);
    return signer.sendTransaction(tx);
  }

  public cancelMultipleOrdersTx(signer: string, orderNonces: string[]): TxData {
    return {
      from: signer,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("cancelMultipleOrders", [
        orderNonces,
      ]),
    };
  }

  // --- Cancel All Orders ---

  public async cancelAllOrders(
    signer: Signer,
    minNonce: string
  ): Promise<ContractTransaction> {
    const signerAddress = lc(await signer.getAddress());
    const tx = this.cancelAllOrdersTx(signerAddress, minNonce);
    return signer.sendTransaction(tx);
  }

  public cancelAllOrdersTx(signer: string, minNonce: string): TxData {
    return {
      from: signer,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("cancelAllOrders", [
        minNonce,
      ]),
    };
  }

  protected checkOrders(taker: string, orders: Order[]) {
    const sameSide = orders.every(
      (order) => order.isSellOrder === orders[0].isSellOrder
    );
    if (!sameSide) {
      throw new Error("All orders must be of the same side");
    }

    const sameCurrency = orders.every(
      (order) => order.currency === orders[0].currency
    );
    if (!sameCurrency) {
      throw new Error("All orders must be of the same currency");
    }

    const differentAccounts = orders.every((order) => order.signer !== taker);
    if (!differentAccounts) {
      throw new Error("No dogfooding");
    }
  }
}
