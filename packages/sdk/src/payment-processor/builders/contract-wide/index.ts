import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { BaseBuildParams, BaseBuilder } from "../base";
import { Order } from "../../order";
import { s } from "../../../utils";

interface BuildParams extends BaseBuildParams {}

export class ContractWideBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
        trader: order.params.sellerOrBuyer,
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
      kind: "collection-offer-approval",
      protocol: params.protocol,
      collectionLevelOffer: true,
      sellerAcceptedOffer: true,
      marketplace: params.marketplace!,
      marketplaceFeeNumerator: s(params.marketplaceFeeNumerator),
      maxRoyaltyFeeNumerator: s(params.maxRoyaltyFeeNumerator),
      privateBuyerOrDelegatedPurchaser: AddressZero,
      sellerOrBuyer: params.trader,
      tokenAddress: params.tokenAddress,
      tokenId: "0",
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
      tokenId?: BigNumberish;
      maxRoyaltyFeeNumerator?: BigNumberish;
    }
  ): Order {
    const orderParams = order.params;
    return new Order(order.chainId, {
      kind: "sale-approval",
      protocol: orderParams.protocol,
      collectionLevelOffer: false,
      sellerAcceptedOffer: true,
      marketplace: orderParams.marketplace,
      marketplaceFeeNumerator: orderParams.marketplaceFeeNumerator,
      maxRoyaltyFeeNumerator:
        options?.maxRoyaltyFeeNumerator?.toString() ?? order.params.maxRoyaltyFeeNumerator,
      privateBuyerOrDelegatedPurchaser: AddressZero,
      sellerOrBuyer: options.taker,
      tokenAddress: orderParams.tokenAddress,
      tokenId: s(options.tokenId),
      amount: orderParams.amount,
      price: orderParams.price,
      expiration: orderParams.expiration,
      nonce: orderParams.nonce,
      coin: orderParams.coin,
      masterNonce: s(options.takerMasterNonce),
    });
  }
}
