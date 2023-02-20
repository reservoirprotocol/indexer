import { BigNumberish } from "@ethersproject/bignumber";

import { BaseBuildParams, BaseBuilder } from "../base";
import { Order } from "../../order";
import * as Types from "../../types";
import { s } from "../../../utils";

export class ContractWideBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
        tokenKind:
          order.params.itemKind === Types.ItemKind.ERC721_WITH_CRITERIA
            ? "erc721"
            : "erc1155",
        contract: order.params.token,
      } as any);

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

  public build(params: BaseBuildParams) {
    this.defaultInitialize(params);

    return new Order(this.chainId, {
      kind: "contract-wide",
      itemKind:
        params.tokenKind === "erc721"
          ? Types.ItemKind.ERC721_WITH_CRITERIA
          : Types.ItemKind.ERC1155_WITH_CRITERIA,
      maker: params.maker,
      token: params.contract,
      identifierOrCriteria: "0",
      unitPrice: s(params.unitPrice),
      amount: params.amount!,
      salt: s(params.salt!),
      counter: s(params.counter),
      expiration: s(params.expiration!),
    });
  }

  public buildMatching(
    _order: Order,
    data: {
      tokenId: string;
      amount?: BigNumberish;
    }
  ): Types.MatchParams {
    return {
      fillAmount: data?.amount ? s(data.amount) : "1",
      tokenId: data.tokenId,
      criteriaProof: [],
    };
  }
}
