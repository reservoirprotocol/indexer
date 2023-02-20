import { BigNumberish } from "@ethersproject/bignumber";

import {
  generateMerkleProof,
  generateMerkleTree,
} from "../../../common/helpers";
import { BaseBuildParams, BaseBuilder } from "../base";
import { Order } from "../../order";
import * as Types from "../../types";
import { s } from "../../../utils";

interface BuildParams extends BaseBuildParams {
  tokenIds?: BigNumberish[];
  merkleRoot?: BigNumberish;
}

export class TokenListBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const copyOrder = this.build({
        ...order.params,
        tokenKind:
          order.params.itemKind === Types.ItemKind.ERC721_WITH_CRITERIA
            ? "erc721"
            : "erc1155",
        contract: order.params.token,
        merkleRoot: order.params.identifierOrCriteria,
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

  public build(params: BuildParams) {
    this.defaultInitialize(params);

    const merkleRoot =
      params.merkleRoot ?? generateMerkleTree(params.tokenIds!).getHexRoot();

    return new Order(this.chainId, {
      kind: "token-list",
      itemKind:
        params.tokenKind === "erc721"
          ? Types.ItemKind.ERC721_WITH_CRITERIA
          : Types.ItemKind.ERC1155_WITH_CRITERIA,
      maker: params.maker,
      token: params.contract,
      identifierOrCriteria: s(merkleRoot),
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
      tokenIds: string[];
      amount?: BigNumberish;
    }
  ): Types.MatchParams {
    const merkleTree = generateMerkleTree(data.tokenIds);
    const merkleProof = generateMerkleProof(merkleTree, data.tokenId);

    return {
      fillAmount: data.amount ? s(data.amount) : "1",
      tokenId: data.tokenId,
      criteriaProof: merkleProof,
    };
  }
}
