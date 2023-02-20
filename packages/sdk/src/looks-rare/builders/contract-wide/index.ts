import { BigNumberish } from "@ethersproject/bignumber";

import { BaseBuildParams, BaseBuilder } from "../base";
import * as Addresses from "../../addresses";
import { Order } from "../../order";
import { BytesEmpty, s } from "../../../utils";

interface BuildParams extends BaseBuildParams {}

export class ContractWideBuilder extends BaseBuilder {
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
        Addresses.StrategyCollectionSale[this.chainId],
        Addresses.StrategyCollectionSaleDeprecated[this.chainId],
      ].includes(params.strategy.toLowerCase())
    ) {
      throw new Error("Invalid strategy");
    }

    if (params.isOrderAsk) {
      throw new Error("Unsupported order side");
    }

    this.defaultInitialize(params);

    return new Order(this.chainId, {
      kind: "contract-wide",
      isOrderAsk: params.isOrderAsk,
      signer: params.signer,
      collection: params.collection,
      price: s(params.price),
      tokenId: "0",
      amount: "1",
      strategy:
        params.strategy ?? Addresses.StrategyCollectionSale[this.chainId],
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

  public buildMatching(
    order: Order,
    taker: string,
    data: { tokenId: BigNumberish }
  ) {
    return {
      isOrderAsk: !order.params.isOrderAsk,
      taker,
      price: order.params.price,
      tokenId: s(data.tokenId),
      minPercentageToAsk:
        order.params.strategy.toLowerCase() ===
        Addresses.StrategyCollectionSale[this.chainId]
          ? 9800
          : 9750,
      params: BytesEmpty,
    };
  }
}
