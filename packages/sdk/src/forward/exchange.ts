import {
  Provider,
  TransactionResponse,
} from "@ethersproject/abstract-provider";
import { Signer } from "@ethersproject/abstract-signer";
import { BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";

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
    matchParams: Types.MatchParams,
    options?: {
      source?: string;
    }
  ): Promise<TransactionResponse> {
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
    matchParams: Types.MatchParams,
    options?: {
      source?: string;
    }
  ): TxData {
    if (order.params.kind === "single-token") {
      return {
        from: taker,
        to: this.contract.address,
        data:
          this.contract.interface.encodeFunctionData("fillBid", [
            {
              order: order.params,
              signature: order.params.signature!,
              fillAmount: matchParams.fillAmount,
            },
          ]) + generateSourceBytes(options?.source),
      };
    } else {
      return {
        from: taker,
        to: this.contract.address,
        data:
          this.contract.interface.encodeFunctionData("fillBidWithCriteria", [
            {
              order: order.params,
              signature: order.params.signature!,
              fillAmount: matchParams.fillAmount,
            },
            matchParams.tokenId!,
            matchParams.criteriaProof!,
          ]) + generateSourceBytes(options?.source),
      };
    }
  }

  // --- Cancel order ---

  public async cancelOrder(
    maker: Signer,
    order: Order
  ): Promise<TransactionResponse> {
    const tx = this.cancelOrderTx(await maker.getAddress(), order);
    return maker.sendTransaction(tx);
  }

  public cancelOrderTx(maker: string, order: Order): TxData {
    return {
      from: maker,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("cancel", [
        [order.params],
      ]),
    };
  }

  // --- Create vault ---

  public async createVault(owner: Signer): Promise<TransactionResponse> {
    const tx = this.createVaultTx(await owner.getAddress());
    return owner.sendTransaction(tx);
  }

  public createVaultTx(owner: string): TxData {
    return {
      from: owner,
      to: this.contract.address,
      data: this.contract.interface.encodeFunctionData("createVault"),
    };
  }

  // --- Get counter (eg. nonce) ---

  public async getCounter(
    provider: Provider,
    user: string
  ): Promise<BigNumberish> {
    return this.contract.connect(provider).counters(user);
  }
}
