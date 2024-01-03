import * as Addresses from "./addresses";
import ExchangeAbi from "./abis/HotpotMarketplace.json";
import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { TxData, s } from "../utils";
import { OrderParameters } from "./types";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { BigNumberish } from "@ethersproject/bignumber";
import { Order } from "./order";

export class Exchange {
  public exchangeAddress: string;
  public contract: Contract;
  public chainId: number;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.exchangeAddress = Addresses.Exchange[chainId];
    this.contract = new Contract(this.exchangeAddress, ExchangeAbi);
  }

  public eip712Domain(): {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  } {
    return {
      name: "Hotpot",
      version: "0.1.0",
      chainId: this.chainId,
      verifyingContract: this.exchangeAddress,
    };
  }

  public async fulfillOrder(
    taker: Signer,
    order_data: OrderParameters
  ): Promise<ContractTransaction> {
    const tx = await this.fulfillOrderTx(taker, await taker.getAddress(), order_data);
    return taker.sendTransaction(tx);
  }

  public async fulfillOrderTx(
    provider: Provider | Signer,
    taker: string,
    order_data: OrderParameters
  ): Promise<TxData> {
    const data = this.contract.interface.encodeFunctionData("fulfillOrder", [order_data]);
    const trade_amount = await this.calculateTradeAmount(provider, order_data);

    return {
      from: taker,
      to: this.contract.address,
      data: data,
      value: s(trade_amount),
    };
  }

  public async fulfilledOrCancelled(provider: Provider, order_hash: string): Promise<boolean> {
    const order_status = await this.contract.connect(provider).orderStatus(order_hash);
    return order_status.isFulfilled || order_status.isCancelled;
  }

  // --- Cancel order ---

  public async cancelOrder(maker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.cancelOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(maker: string, order: Order): TxData {
    return {
      from: maker,
      to: this.exchangeAddress,
      data: this.contract.interface.encodeFunctionData("cancelOrder", [
        {
          offerer: order.params.offerer,
          offerItem: order.params.offerItem,
          royalty: order.params.royalty,
          salt: order.params.salt,
        },
      ]),
    };
  }

  public async raffleContractAddress(provider: Provider): Promise<string> {
    return await this.contract.connect(provider).raffleContract();
  }

  public async calculateTradeAmount(
    provider: Provider | Signer,
    order: OrderParameters
  ): Promise<BigNumberish> {
    const HUNDRED_PERCENT = BigInt(10000);
    const hotpot_trade_fee = await this.contract.connect(provider).raffleTradeFee();
    const price = BigInt(order.offerItem.offerAmount);
    const royalty_percent = BigInt(order.royalty.royaltyPercent);

    return (
      (price * HUNDRED_PERCENT) / (HUNDRED_PERCENT - BigInt(hotpot_trade_fee) - royalty_percent)
    );
  }

  public async calculateRaffleFee(
    provider: Provider,
    order: OrderParameters
  ): Promise<BigNumberish> {
    const HUNDRED_PERCENT = BigInt(10000);
    const hotpot_trade_fee = await this.contract.connect(provider).raffleTradeFee();
    const price = BigInt(order.offerItem.offerAmount);
    const royalty_percent = BigInt(order.royalty.royaltyPercent);

    const trade_amount =
      (price * HUNDRED_PERCENT) / (HUNDRED_PERCENT - BigInt(hotpot_trade_fee) - royalty_percent);

    return (trade_amount * BigInt(hotpot_trade_fee)) / HUNDRED_PERCENT;
  }
}
