import { BigNumberish } from "@ethersproject/bignumber";

import { BaseBuildParams, BaseBuilder } from "../base";
import { Order } from "../../order";
import * as Types from "../../types";
import { BytesEmpty, lc, s, n } from "../../../utils";
import { HashZero } from "@ethersproject/constants";

export class SingleTokenBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
        side: order.params.side === Types.TradeDirection.SELL ? "sell" : "buy",
      });

      if (!copyOrder) {
        return false;
      }

      if (copyOrder.hash() !== order.hash()) {
        return false;
      }
    } catch {
      return false;
    }

    return true;
  }

  public build(params: BaseBuildParams) {
    this.defaultInitialize(params);

    return new Order(this.chainId, {
      side:
        params.side === "sell"
          ? Types.TradeDirection.SELL
          : Types.TradeDirection.BUY,
      trader: params.trader,
      collection: params.collection,
      matchingPolicy: params.matchingPolicy,
      tokenId: s(params.tokenId),
      nonce: s(params.nonce),
      amount: s(params.amount)!,
      paymentToken: lc(params.paymentToken)!,
      price: s(params.price),
      listingTime: s(params.listingTime),
      expirationTime: s(params.expirationTime),
      fees: params.fees!.map(({ recipient, rate }) => ({
        recipient: lc(recipient),
        rate: n(rate),
      })), 
      salt: params.salt ? s(params.salt) : '0',
      extraParams: params.extraParams ? s(params.extraParams) : BytesEmpty,
      signatureVersion: params.signatureVersion,
      extraSignature: params.extraSignature ?? BytesEmpty,
      blockNumber: params.blockNumber ?? 0,
      v: params.v,
      r: params.r,
      s: params.s,
    });
  }

  public buildMatching(
    order: Order,
    data?: { amount?: BigNumberish, trader: string, blockNumber?: number, listingTime?: number, expirationTime?: number }
  ) {
    const isSell = order.params.side === Types.TradeDirection.SELL
    const matchSide = isSell ? Types.TradeDirection.BUY : Types.TradeDirection.SELL
    return {
      order: {
        ...order.params,
        trader: data?.trader ?? order.params.trader,
        side: matchSide,
        amount: data?.amount ? s(data.amount) : "1",
        listingTime: data?.listingTime ? s(data?.listingTime ) : order.params.listingTime,
        expirationTime: data?.expirationTime ? s(data?.expirationTime) : order.params.expirationTime
      },
      v: 0,
      r: HashZero,
      s: HashZero,
      extraSignature: BytesEmpty,
      signatureVersion: 0,
      blockNumber: data?.blockNumber ?? 0
    };
  }
}
