import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { BaseBuildParams, BaseBuilder } from "../base";
import { MatchedOrder } from "../../types";
import { Order } from "../../order";
import { s } from "../../../utils";

interface BuildParams extends BaseBuildParams {
  tokenId: BigNumberish;
  beneficiary?: string;
}

export class SingleTokenBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
        maker: order.params.sellerOrBuyer,
        tokenId: order.params.tokenId!,
        beneficiary: order.params.beneficiary ?? undefined,
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

    const kind = params.beneficiary ? "item-offer-approval" : "sale-approval";

    return new Order(this.chainId, {
      kind,
      protocol: params.protocol,
      cosigner: params.cosigner,
      sellerOrBuyer: params.maker,
      marketplace: params.marketplace ?? AddressZero,
      paymentMethod: params.paymentMethod,
      tokenAddress: params.tokenAddress,
      amount: s(params.amount),
      itemPrice: s(params.itemPrice),
      expiration: s(params.expiration),
      fallbackRoyaltyRecipient: params.fallbackRoyaltyRecipient ?? AddressZero,
      marketplaceFeeNumerator: s(params.marketplaceFeeNumerator ?? "0"),
      nonce: s(params.nonce),
      masterNonce: s(params.masterNonce),

      maxRoyaltyFeeNumerator:
        kind === "sale-approval" ? s(params.maxRoyaltyFeeNumerator ?? "0") : undefined,

      beneficiary: params.beneficiary ?? undefined,

      tokenId: s(params.tokenId),

      v: params.v,
      r: params.r,
      s: params.s,
    });
  }

  public buildMatching(
    order: Order,
    options: {
      taker: string;
      amount?: BigNumberish;
      maxRoyaltyFeeNumerator?: BigNumberish;
    }
  ): MatchedOrder {
    return order.getMatchedOrder(options.taker, options);
  }
}
