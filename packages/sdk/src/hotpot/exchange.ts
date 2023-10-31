import * as Addresses from "./addresses";
import ExchangeAbi from "./abis/HotpotMarketplace.json";
import { Provider } from "@ethersproject/abstract-provider";
import { Wallet, ethers } from "ethers";
import { Signer } from "@ethersproject/abstract-signer";
import { TxData, s } from "../utils";
import { OrderParameters } from "./types";
import { Contract, ContractTransaction } from "@ethersproject/contracts";
import { BigNumberish } from "@ethersproject/bignumber";
import { config as dotEnvConfig } from "dotenv";
import { Order } from "./order";
dotEnvConfig();

export class Exchange {
  public exchangeAddress: string;
  public contract: Contract;
  public chainId: number;
  public operator: Wallet;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.exchangeAddress = Addresses.Exchange[chainId];
    this.contract = new Contract(this.exchangeAddress, ExchangeAbi);

    const operator_pk = process.env.HOTPOT_OPERATOR_PK;

    if (!operator_pk) {
      throw new Error("Hotpot - unable to initialize exchange, specify operator private key");
    }

    this.operator = new ethers.Wallet(operator_pk);
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
    const tx = await this.fulfillOrderTx(await taker.getAddress(), order_data);
    return taker.sendTransaction(tx);
  }

  public async fulfillOrderTx(taker: string, order_data: OrderParameters): Promise<TxData> {
    const data = this.contract.interface.encodeFunctionData("fulfillOrder", [order_data]);
    const trade_amount = await this.calculateTradeAmount(order_data);

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
        [
          {
            offerer: order.params.offerer,
            offerItem: order.params.offerItem,
            royalty: order.params.royalty,
            salt: order.params.salt,
          },
        ],
      ]),
    };
  }

  public async raffleContractAddress(): Promise<string> {
    return await this.contract.raffleContract();
  }

  public async calculateTradeAmount(order: OrderParameters): Promise<BigNumberish> {
    const HUNDRED_PERCENT = BigInt(10000);
    const hotpot_trade_fee = await this.contract.raffleTradeFee();
    const price = BigInt(order.offerItem.offerAmount);
    const royalty_percent = BigInt(order.royalty.royaltyPercent);

    return (price * HUNDRED_PERCENT) / (HUNDRED_PERCENT - hotpot_trade_fee - royalty_percent);
  }

  public async calculateRaffleFee(order: OrderParameters): Promise<BigNumberish> {
    const HUNDRED_PERCENT = BigInt(10000);
    const hotpot_trade_fee = await this.contract.raffleTradeFee();
    const price = BigInt(order.offerItem.offerAmount);
    const royalty_percent = BigInt(order.royalty.royaltyPercent);

    const trade_amount =
      (price * HUNDRED_PERCENT) / (HUNDRED_PERCENT - hotpot_trade_fee - royalty_percent);

    return (trade_amount * hotpot_trade_fee) / HUNDRED_PERCENT;
  }
}
