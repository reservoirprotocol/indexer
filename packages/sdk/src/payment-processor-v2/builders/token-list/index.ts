import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { defaultAbiCoder } from "@ethersproject/abi";
import { keccak256 } from "@ethersproject/keccak256";
import MerkleTree from "merkletreejs";

import { BaseBuildParams, BaseBuilder } from "../base";
import { Order } from "../../order";
import { MatchedOrder } from "../../types";
import * as common from "../../../common/helpers/merkle";
import { s } from "../../../utils";

// PaymentProcessorV2 has different hashing logic compared to Seaport (which can be found in `common/helpers/merkle.ts` logic)

export const hashFn = (token: string, tokenId: BigNumberish) =>
  keccak256(defaultAbiCoder.encode(["address", "uint256"], [token, tokenId]));

export const generateMerkleTree = (token: string, tokenIds: BigNumberish[]) => {
  if (!tokenIds.length) {
    throw new Error("Could not generate merkle tree");
  }

  const leaves = tokenIds.map((tokenId) => hashFn(token, tokenId));
  return new MerkleTree(leaves, keccak256, { sort: true });
};

export const generateMerkleProof = (merkleTree: MerkleTree, token: string, tokenId: BigNumberish) =>
  merkleTree.getHexProof(hashFn(token, tokenId));

interface BuildParams extends BaseBuildParams {
  beneficiary: string;
  tokenIds: BigNumberish[];
}

export class TokenListBuilder extends BaseBuilder {
  public isValid(order: Order): boolean {
    try {
      const params = order.params;
      const copyOrder = this.build({
        ...params,
        maker: params.sellerOrBuyer,
        beneficiary: params.beneficiary!,
        tokenIds: [],
      });

      copyOrder.params.tokenSetMerkleRoot = params.tokenSetMerkleRoot!;

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

    const tokenSetMerkleRoot =
      params.tokenSetMerkleRoot ??
      generateMerkleTree(params.tokenAddress, params.tokenIds).getHexRoot();

    const seaportStyleMerkleRoot =
      params.tokenSetMerkleRoot ?? common.generateMerkleTree(params.tokenIds).getHexRoot();

    return new Order(this.chainId, {
      kind: "token-set-offer-approval",
      protocol: params.protocol,
      cosigner: params.cosigner,
      sellerOrBuyer: params.maker,
      marketplace: params.marketplace ?? AddressZero,
      paymentMethod: params.paymentMethod,
      tokenAddress: params.tokenAddress,
      amount: s(params.amount),
      itemPrice: s(params.itemPrice),
      expiration: s(params.expiration),
      marketplaceFeeNumerator: s(params.marketplaceFeeNumerator ?? "0"),
      nonce: s(params.nonce),
      masterNonce: s(params.masterNonce),

      beneficiary: params.beneficiary ?? undefined,

      tokenSetMerkleRoot: tokenSetMerkleRoot,
      seaportStyleMerkleRoot,

      v: params.v,
      r: params.r,
      s: params.s,
    });
  }

  public buildMatching(
    order: Order,
    options: {
      taker: string;
      amount?: BigNumberish;
      tokenId?: BigNumberish;
      tokenIds?: BigNumberish[];
      maxRoyaltyFeeNumerator?: BigNumberish;
    }
  ): MatchedOrder {
    const merkleTree = generateMerkleTree(order.params.tokenAddress, options.tokenIds!);
    const merkleProof = generateMerkleProof(
      merkleTree,
      order.params.tokenAddress,
      options.tokenId!
    );
    order.params.tokenSetProof = merkleProof;

    return order.getMatchedOrder(options.taker, options);
  }
}
