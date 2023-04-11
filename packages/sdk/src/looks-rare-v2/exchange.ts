import { Provider } from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumberish } from "@ethersproject/bignumber";
import { joinSignature } from "@ethersproject/bytes";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

import * as Addresses from "./addresses";
import { Order } from "./order";
import * as Types from "./types";
import { TxData, bn, generateSourceBytes } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";
import TransferManagerAbi from "./abis/TransferManager.json";

export class Exchange {
  public chainId: number;
  public contract: Contract;
  public transferManager: Contract;

  constructor(chainId: number) {
    this.chainId = chainId;
    this.contract = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi);
    this.transferManager = new Contract(
      Addresses.TransferManager[this.chainId],
      TransferManagerAbi
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
    const tx = this.fillOrderTx(await taker.getAddress(), makerOrder, takerOrderParams, options);
    return taker.sendTransaction(tx);
  }

  public async grantApprovals(maker: Signer, operators: string[]) {
    const tx = this.grantApprovalsTx(await maker.getAddress(), operators);
    return maker.sendTransaction(tx);
  }

  public grantApprovalsTx(maker: string, operators: string[]): TxData {
    return {
      from: maker,
      to: this.transferManager.address,
      data: this.transferManager.interface.encodeFunctionData("grantApprovals", [operators]),
    };
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

    const signature = makerOrder.params.signature!;

    const makerSignature = joinSignature(signature);
    const affiliate = AddressZero;
    const merkleTree = makerOrder.params.merkleTree ?? {
      root: HashZero,
      proof: [],
    };

    if (makerOrder.params.quoteType === Types.QuoteType.Ask) {
      data = this.contract.interface.encodeFunctionData("executeTakerBid", [
        takerOrderParams,
        makerOrder.params,
        makerSignature,
        merkleTree,
        affiliate,
      ]);
      value = makerOrder.params.price;
    } else {
      data = this.contract.interface.encodeFunctionData("executeTakerAsk", [
        takerOrderParams,
        makerOrder.params,
        makerSignature,
        merkleTree,
        affiliate,
      ]);
    }

    return {
      from: taker,
      to: this.contract.address,
      data: data + generateSourceBytes(options?.source),
      value: value && bn(value).toHexString(),
    };
  }

  // --- Cancel order ---

  public async cancelOrder(maker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.cancelOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(maker: string, order: Order): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("cancelOrderNonces", [
        [order.params.orderNonce],
      ]),
    };
  }

  public async cancelOrdersWithSubset(maker: Signer, order: Order): Promise<ContractTransaction> {
    const tx = this.cancelOrdersWithSubsetTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrdersWithSubsetTx(maker: string, order: Order): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("cancelSubsetNonces", [
        [order.params.subsetNonce],
      ]),
    };
  }

  public async cancelAllOrders(maker: Signer, side: "buy" | "sell"): Promise<ContractTransaction> {
    const tx = this.cancelAllOrdersTx(await maker.getAddress(), side);
    return maker.sendTransaction(tx);
  }

  public cancelAllOrdersTx(maker: string, side: "buy" | "sell"): TxData {
    const bid = side === "buy" ? true : false;
    const ask = side === "sell" ? true : false;
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("incrementBidAskNonces", [bid, ask]),
    };
  }

  // --- Get nonce ---

  public async getGlobalNonce(
    provider: Provider,
    user: string,
    side: "sell" | "buy"
  ): Promise<BigNumberish> {
    const nonces = await new Contract(Addresses.Exchange[this.chainId], ExchangeAbi)
      .connect(provider)
      .userBidAskNonces(user);
    return side === "sell" ? nonces.askNonce : nonces.bidNonce;
  }
}
