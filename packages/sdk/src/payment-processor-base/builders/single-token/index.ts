import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { BaseBuildParams, BaseBuilder } from "../base";
import { MatchedOrder, BaseOrder } from "../../types";
import { IOrder } from "../../order";
import { s } from "../../../utils";

interface BuildParams extends BaseBuildParams {
  tokenId: BigNumberish;
  beneficiary?: string;
}

export class SingleTokenBuilder extends BaseBuilder {
  public isValid<T extends IOrder>(
    order: IOrder,
    orderBuilder: { new (chainId: number, params: BaseOrder): T }
  ): boolean {
    try {
      const copyOrder = this.build(
        {
          ...order.params,
          maker: order.params.sellerOrBuyer,
          tokenId: order.params.tokenId!,
          beneficiary: order.params.beneficiary ?? undefined,
        },
        orderBuilder
      );

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

  public build<T extends IOrder>(
    params: BuildParams,
    orderBuilder: { new (chainId: number, params: BaseOrder): T }
  ): T {
    this.defaultInitialize(params);

    const kind = params.beneficiary ? "item-offer-approval" : "sale-approval";

    return new orderBuilder(this.chainId, {
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
    order: IOrder,
    options: {
      taker: string;
      amount?: BigNumberish;
      maxRoyaltyFeeNumerator?: BigNumberish;
    }
  ): MatchedOrder {
    return order.getMatchedOrder(options.taker, options);
  }
}
