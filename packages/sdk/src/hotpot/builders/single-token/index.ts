import { n, s } from "../../../utils";
import { Order } from "../../order";
import { BaseBuildParams, BaseBuilder } from "../base";

interface BuildParams extends BaseBuildParams {
  offerTokenId: string;
}

export class SingleTokenBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
        collectionType: order.params.tokenType!,
        tokenContract: order.params.offerItem.offerToken,
        price: order.params.offerItem.offerAmount,
        offerTokenId: order.params.offerItem.offerTokenId,
        amount: order.params.offerItem.amount,
        endTime: order.params.offerItem.endTime,
        royaltyPercent: order.params.royalty.royaltyPercent,
        royaltyRecepient: order.params.royalty.royaltyRecipient,
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
      kind: "single-token",
      currency: params.currency!,

      offerer: params.offerer,
      offerItem: {
        offerToken: params.tokenContract,
        offerTokenId: params.offerTokenId,
        offerAmount: s(params.price),
        endTime: params.endTime!,
        amount: n(params.amount!),
      },
      royalty: {
        royaltyPercent: params.royaltyPercent!,
        royaltyRecipient: params.royaltyRecepient!,
      },
      salt: n(params.salt!),
      orderSignature: params.orderSignature,
      tokenType: params.collectionType,
    });
  }

  public async buildMatching(order: Order, receiver: string) {
    return {
      ...order.getExchangeOrderParams(),
      receiver,
    };
  }
}
