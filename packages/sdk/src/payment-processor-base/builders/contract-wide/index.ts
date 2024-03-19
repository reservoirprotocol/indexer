import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { BaseBuildParams, BaseBuilder } from "../base";
import { IOrder } from "../../order";
import { MatchedOrder, BaseOrder } from "../../types";
import { s } from "../../../utils";

interface BuildParams extends BaseBuildParams {
  beneficiary: string;
}

export class ContractWideBuilder extends BaseBuilder {
  public isValid<T extends IOrder>(
    order: IOrder,
    orderBuilder: { new (chainId: number, params: BaseOrder): T }
  ): boolean {
    try {
      const copyOrder = this.build(
        {
          ...order.params,
          maker: order.params.sellerOrBuyer,
          beneficiary: order.params.beneficiary!,
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

    return new orderBuilder(this.chainId, {
      kind: "collection-offer-approval",
      protocol: params.protocol,
      cosigner: params.cosigner,
      sellerOrBuyer: params.maker,
      marketplace: params.marketplace ?? AddressZero,
      fallbackRoyaltyRecipient: params.fallbackRoyaltyRecipient ?? AddressZero,
      paymentMethod: params.paymentMethod,
      tokenAddress: params.tokenAddress,
      amount: s(params.amount),
      itemPrice: s(params.itemPrice),
      expiration: s(params.expiration),
      marketplaceFeeNumerator: s(params.marketplaceFeeNumerator ?? "0"),
      nonce: s(params.nonce),
      masterNonce: s(params.masterNonce),

      beneficiary: params.beneficiary ?? undefined,

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
      tokenId?: BigNumberish;
      maxRoyaltyFeeNumerator?: BigNumberish;
    }
  ): MatchedOrder {
    order.params.tokenId = options.tokenId!.toString();
    return order.getMatchedOrder(options.taker, options);
  }
}
