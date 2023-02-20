import { BigNumberish } from "@ethersproject/bignumber";

import { BaseBuildParams, BaseBuilder } from "../base";
import * as Addresses from "../../addresses";
import { Order } from "../../order";
import { BytesEmpty, s } from "../../../utils";

interface BuildParams extends BaseBuildParams {
  tokenId: BigNumberish;
}

export class SingleTokenBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
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
    if (
      params.strategy &&
      ![
        Addresses.StrategyStandardSale[this.chainId],
        Addresses.StrategyStandardSaleDeprecated[this.chainId],
      ].includes(params.strategy.toLowerCase())
    ) {
      throw new Error("Invalid strategy");
    }

    this.defaultInitialize(params);

    return new Order(this.chainId, {
      kind: "single-token",
      isOrderAsk: params.isOrderAsk,
      signer: params.signer,
      collection: params.collection,
      price: s(params.price),
      tokenId: s(params.tokenId),
      amount: "1",
      strategy: params.strategy ?? Addresses.StrategyStandardSale[this.chainId],
      currency: params.currency,
      nonce: s(params.nonce),
      startTime: params.startTime!,
      endTime: params.endTime!,
      minPercentageToAsk: params.minPercentageToAsk!,
      params: BytesEmpty,
      v: params.v,
      r: params.r,
      s: params.s,
    });
  }

  public buildMatching(order: Order, taker: string) {
    return {
      isOrderAsk: !order.params.isOrderAsk,
      taker,
      price: order.params.price,
      tokenId: order.params.tokenId,
      minPercentageToAsk:
        order.params.strategy.toLowerCase() ===
        Addresses.StrategyStandardSale[this.chainId]
          ? 9800
          : 9750,
      params: BytesEmpty,
    };
  }
}
