import { n, s } from "../../../utils";
import { Order } from "../../order";
import { BaseBuildParams, BaseBuilder } from "../base";
import { BigNumberish } from "@ethersproject/bignumber";
import { EIP712_TYPES, PendingAmountData } from "../../types";

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
    });
  }

  public async buildMatching(
    order: Order,
    receiver: string,
    buyerPendingAmount: BigNumberish,
    offererPendingAmount: BigNumberish
  ) {
    const exchange = order.exchange();
    const operator = exchange.operator;
    const eip712Domain = exchange.eip712Domain();

    const pendingAmountsData: PendingAmountData = {
      buyerPendingAmount: s(buyerPendingAmount),
      offererPendingAmount: s(offererPendingAmount),
      orderHash: s(order.hash()),
    };

    // Sign pending amounts, using operator account
    const pa_signature = await operator._signTypedData(
      eip712Domain,
      EIP712_TYPES,
      pendingAmountsData
    );

    return {
      ...order.params,
      receiver,
      pendingAmountsData,
      pendingAmountsSignature: pa_signature,
    };
  }
}
