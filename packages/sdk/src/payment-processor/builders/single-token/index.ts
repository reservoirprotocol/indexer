import { BigNumberish } from "@ethersproject/bignumber";

import { BaseBuildParams, BaseBuilder } from "../base";
import { Order } from "../../order";
import { s } from "../../../utils";
import { AddressZero } from "@ethersproject/constants";

interface BuildParams extends BaseBuildParams {
  tokenId: BigNumberish;
}

export class SingleTokenBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
        trader: order.params.sellerOrBuyer,
        tokenId: order.params.tokenId!,
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

  public build(params: BuildParams) {
    this.defaultInitialize(params);
    return new Order(this.chainId, {
      kind: params.sellerAcceptedOffer ? "offer-approval" : "sale-approval",
      protocol: params.protocol,
      sellerAcceptedOffer: params.sellerAcceptedOffer,
      marketplace: params.marketplace ?? AddressZero,
      marketplaceFeeNumerator: s(params.marketplaceFeeNumerator) ?? "0",
      maxRoyaltyFeeNumerator: s(params.maxRoyaltyFeeNumerator) ?? "0",
      privateBuyerOrDelegatedPurchaser: AddressZero,
      sellerOrBuyer: params.trader,
      tokenAddress: params.tokenAddress,
      tokenId: s(params.tokenId),
      amount: s(params.amount),
      price: s(params.price),
      expiration: s(params.expiration),
      nonce: s(params.nonce),
      coin: params.coin,
      masterNonce: s(params.masterNonce),
      v: params.v,
      r: params.r,
      s: params.s,
    });
  }

  public buildMatching(
    order: Order,
    options: {
      taker: string;
      takerMasterNonce: BigNumberish;
    }
  ): Order {
    const orderParams = order.params;
    if (orderParams.kind === "sale-approval") {
      return new Order(order.chainId, {
        protocol: orderParams.protocol,
        marketplace: orderParams.marketplace,
        marketplaceFeeNumerator: orderParams.marketplaceFeeNumerator,
        maxRoyaltyFeeNumerator: orderParams.maxRoyaltyFeeNumerator,
        privateBuyerOrDelegatedPurchaser: orderParams.privateBuyerOrDelegatedPurchaser,
        sellerOrBuyer: options.taker,
        tokenAddress: orderParams.tokenAddress,
        tokenId: orderParams.tokenId,
        amount: orderParams.amount,
        price: orderParams.price,
        expiration: orderParams.expiration,
        nonce: orderParams.nonce,
        coin: orderParams.coin,
        masterNonce: s(options.takerMasterNonce),
      });
    } else {
      return new Order(order.chainId, {
        protocol: orderParams.protocol,
        sellerAcceptedOffer: false,
        marketplace: orderParams.marketplace,
        marketplaceFeeNumerator: orderParams.marketplaceFeeNumerator,
        maxRoyaltyFeeNumerator: orderParams.maxRoyaltyFeeNumerator,
        privateBuyerOrDelegatedPurchaser: orderParams.privateBuyerOrDelegatedPurchaser,
        sellerOrBuyer: options.taker,
        tokenAddress: orderParams.tokenAddress,
        tokenId: orderParams.tokenId,
        amount: orderParams.amount,
        price: orderParams.price,
        expiration: orderParams.expiration,
        nonce: orderParams.nonce,
        coin: orderParams.coin,
        masterNonce: s(options.takerMasterNonce),
      });
    }
  }
}
