import { defaultAbiCoder } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";

import { BaseBuildParams, BaseBuilder } from "../base";
import { Order } from "../../order";
import { BytesEmpty, s } from "../../../utils";

interface BuildParams extends BaseBuildParams {
  itemId: BigNumberish;
}

export class SingleTokenBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
        itemId: order.params.itemIds[0],
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

      signer: params.signer,
      collection: params.collection,
      price: s(params.price),
      itemIds: [s(params.itemId)],
      amounts: ["1"],
      strategyId: 0,
      currency: params.currency,
      quoteType: params.quoteType,
      collectionType: params.collectionType,

      startTime: params.startTime!,
      endTime: params.endTime!,
      additionalParameters: params.additionalParameters ?? BytesEmpty,

      globalNonce: params.globalNonce ? s(params.globalNonce) : "0",
      subsetNonce: params.subsetNonce ? s(params.subsetNonce) : "0",
      orderNonce: params.orderNonce ? s(params.orderNonce) : "0",

      signature: params.signature,
    });
  }

  public buildMatching(_order: Order, recipient: string, data: { tokenId: BigNumberish }) {
    return {
      recipient,
      // In theory no additional data is needed for filling single-token orders.
      // However, the router module expects the token id to be encoded in there.
      additionalParameters: defaultAbiCoder.encode(["uint256"], [data.tokenId]),
    };
  }
}
