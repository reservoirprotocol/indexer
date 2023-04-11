import { BigNumberish } from "@ethersproject/bignumber";
import { defaultAbiCoder } from "@ethersproject/abi";
import { BaseBuildParams, BaseBuilder } from "../base";
import { Order } from "../../order";
import { BytesEmpty, s } from "../../../utils";
import { QuoteType } from "../../types";

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
    if (params.quoteType === QuoteType.Ask) {
      throw new Error("Unsupported order side");
    }

    this.defaultInitialize(params);

    return new Order(this.chainId, {
      kind: "contract-wide",
      signer: params.signer,
      collection: params.collection,
      price: s(params.price),
      itemIds: [],
      amounts: ["1"],
      strategyId: 1,
      currency: params.currency,
      quoteType: params.quoteType,
      collectionType: params.collectionType,

      startTime: params.startTime!,
      endTime: params.endTime!,
      additionalParameters: params.additionalParameters ?? BytesEmpty,
      globalNonce: s(params.globalNonce),
      subsetNonce: s(params.subsetNonce),
      orderNonce: s(params.orderNonce),
      signature: params.signature,
    });
  }

  public buildMatching(order: Order, recipient: string, data: { tokenId: BigNumberish }) {
    return {
      recipient,
      additionalParameters: defaultAbiCoder.encode(["uint256"], [data.tokenId]),
    };
  }
}
