import { Interface, defaultAbiCoder } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import {
  generateMerkleProof,
  generateMerkleTree,
} from "../../../common/helpers";
import { BaseBuilder, BaseBuildParams, BaseOrderInfo } from "../base";
import * as Addresses from "../../addresses";
import { Order } from "../../order";
import * as Types from "../../types";
import { getCurrentTimestamp, getRandomBytes, s } from "../../../utils";

import TokenListVerifierAbi from "../../abis/TokenListVerifier.json";
import Erc1155Abi from "../../../common/abis/Erc1155.json";

// Wyvern V2 calldata:
// `safeTransferFrom(address from, address to, uint256 tokenId, uint256 amount, bytes data)`

const REPLACEMENT_PATTERN_BUY = (numTokens: number) => {
  const numMerkleTreeLevels = Math.ceil(Math.log2(numTokens));
  return (
    // `safeTransferFrom` 4byte selector
    "0x00000000" +
    // `from` (empty)
    "f".repeat(64) +
    // `to` (required)
    "0".repeat(64) +
    // `tokenId` (empty)
    "f".repeat(64) +
    // `amount` (required)
    "0".repeat(64) +
    // empty `data` (required)
    "0".repeat(128) +
    // merkle root (required)
    "0".repeat(64) +
    // merkle proof (empty)
    "0".repeat(128) +
    "f".repeat(64).repeat(numMerkleTreeLevels)
  );
};

const REPLACEMENT_PATTERN_SELL = (numTokens: number) => {
  const numMerkleTreeLevels = Math.ceil(Math.log2(numTokens));
  return (
    // `safeTransferFrom` 4byte selector
    "0x00000000" +
    // `from` (empty)
    "0".repeat(64) +
    // `to` (required)
    "f".repeat(64) +
    // `tokenId` (empty)
    "0".repeat(64) +
    // `amount` (required)
    "0".repeat(64) +
    // empty `data` (required)
    "0".repeat(128) +
    // merkle root (empty)
    "f".repeat(64) +
    // merkle proof (required)
    "0".repeat(128) +
    "0".repeat(64).repeat(numMerkleTreeLevels)
  );
};

interface BuildParams extends BaseBuildParams {
  contract: string;
  tokenIds: BigNumberish[];
}

interface OrderInfo extends BaseOrderInfo {
  merkleRoot: string;
}

export class TokenListErc1155Builder extends BaseBuilder {
  constructor(chainId: number) {
    super(chainId);
  }

  public getInfo(order: Order): OrderInfo | undefined {
    try {
      const [merkleRoot] = defaultAbiCoder.decode(
        ["bytes32"],
        "0x" + order.params.calldata.slice(2).slice(392, 392 + 64)
      );

      return {
        contract: order.params.target,
        merkleRoot,
      };
    } catch {
      return undefined;
    }
  }

  public isValid(order: Order) {
    const info = this.getInfo(order);
    if (!info) {
      return false;
    }

    try {
      const copyOrder = this.build({
        ...order.params,
        contract: info.contract,
        tokenIds: [0],
        side: order.params.side === Types.OrderSide.BUY ? "buy" : "sell",
        price: order.params.basePrice,
        fee: 0,
      });

      copyOrder.params.calldata =
        "0x" +
        copyOrder.params.calldata.slice(2).slice(0, 392) +
        order.params.calldata.slice(2).slice(392);
      copyOrder.params.replacementPattern =
        "0x" +
        copyOrder.params.replacementPattern.slice(2).slice(0, 584) +
        order.params.replacementPattern.slice(2).slice(584);
      copyOrder.params.staticExtradata =
        "0x" +
        copyOrder.params.staticExtradata.slice(2).slice(0, 74) +
        order.params.staticExtradata.slice(2).slice(74);

      if (!copyOrder) {
        return false;
      }

      copyOrder.params.taker = order.params.taker;
      copyOrder.params.makerRelayerFee = order.params.makerRelayerFee;
      copyOrder.params.takerRelayerFee = order.params.takerRelayerFee;

      if (copyOrder.hash() !== order.hash()) {
        return false;
      }
    } catch {
      return false;
    }

    return true;
  }

  public build(params: BuildParams) {
    const saleKind = this.defaultInitialize(params);

    if (params.side === "buy") {
      const numMerkleTreeLevels = Math.ceil(Math.log2(params.tokenIds.length));
      const merkleTree = generateMerkleTree(params.tokenIds);

      const calldata =
        new Interface(Erc1155Abi).encodeFunctionData("safeTransferFrom", [
          AddressZero,
          params.recipient ?? params.maker,
          0,
          1,
          "0x",
        ]) +
        // merkle root
        merkleTree.getHexRoot().slice(2) +
        // merkle proof
        defaultAbiCoder.encode(["uint256"], [64]).slice(2) +
        defaultAbiCoder.encode(["uint256"], [numMerkleTreeLevels]).slice(2) +
        "0".repeat(64).repeat(numMerkleTreeLevels);

      const staticExtradata =
        new Interface(TokenListVerifierAbi as any).getSighash("verifyErc1155") +
        defaultAbiCoder.encode(["uint256"], [32]).slice(2) +
        defaultAbiCoder
          .encode(["uint256"], [calldata.slice(2).length / 2])
          .slice(2);

      return new Order(this.chainId, {
        kind: "erc1155-token-list",
        exchange: Addresses.Exchange[this.chainId],
        maker: params.maker,
        taker: AddressZero,
        makerRelayerFee: 0,
        takerRelayerFee: params.fee,
        feeRecipient: params.feeRecipient,
        side: Types.OrderSide.BUY,
        saleKind,
        target: params.contract,
        howToCall: Types.OrderHowToCall.CALL,
        calldata,
        replacementPattern: REPLACEMENT_PATTERN_BUY(params.tokenIds.length),
        staticTarget: Addresses.TokenListVerifier[this.chainId],
        staticExtradata,
        paymentToken: params.paymentToken,
        basePrice: s(params.price),
        extra: s(params.extra),
        listingTime: params.listingTime!,
        expirationTime: params.expirationTime!,
        salt: s(params.salt),
        nonce: s(params.nonce),
        v: params.v,
        r: params.r,
        s: params.s,
      });
    } else if (params.side === "sell") {
      throw new Error("Unsupported order side");
    } else {
      throw new Error("Invalid order side");
    }
  }

  public buildMatching(
    order: Order,
    taker: string,
    data: {
      tokenId: string;
      tokenIds: string[];
      nonce: string;
    }
  ) {
    const info = this.getInfo(order);
    if (!info) {
      throw new Error("Invalid order");
    }

    const numMerkleTreeLevels = Math.ceil(Math.log2(data.tokenIds.length));
    const merkleTree = generateMerkleTree(data.tokenIds);
    if (merkleTree.getHexRoot() !== info.merkleRoot) {
      throw new Error("Token ids not matching merkle root");
    }

    const merkleProof = generateMerkleProof(merkleTree, data.tokenId)
      .map((proof) => proof.slice(2))
      .join("");

    if (order.params.side === Types.OrderSide.BUY) {
      const calldata =
        new Interface(Erc1155Abi as any).encodeFunctionData(
          "safeTransferFrom",
          [taker, AddressZero, data.tokenId, 1, "0x"]
        ) +
        // merkle root
        "0".repeat(64) +
        // merkle proof
        defaultAbiCoder.encode(["uint256"], [64]).slice(2) +
        defaultAbiCoder.encode(["uint256"], [numMerkleTreeLevels]).slice(2) +
        merkleProof;

      return new Order(this.chainId, {
        kind: "erc1155-token-list",
        exchange: Addresses.Exchange[this.chainId],
        maker: taker,
        taker: AddressZero,
        makerRelayerFee: 0,
        takerRelayerFee: order.params.takerRelayerFee,
        feeRecipient: AddressZero,
        side: Types.OrderSide.SELL,
        saleKind: Types.OrderSaleKind.FIXED_PRICE,
        target: info.contract,
        howToCall: Types.OrderHowToCall.CALL,
        calldata,
        replacementPattern: REPLACEMENT_PATTERN_SELL(data.tokenIds.length),
        staticTarget: AddressZero,
        staticExtradata: "0x",
        paymentToken: order.params.paymentToken,
        basePrice: s(order.getMatchingPrice()),
        extra: s(order.params.extra),
        listingTime: getCurrentTimestamp(-60),
        expirationTime: 0,
        salt: s(getRandomBytes()),
        nonce: s(data.nonce),
      });
    } else if (order.params.side === Types.OrderSide.SELL) {
      throw new Error("Unsupported order side");
    } else {
      throw new Error("Invalid order side");
    }
  }
}
