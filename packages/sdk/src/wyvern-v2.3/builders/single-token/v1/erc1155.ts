import { Interface } from "@ethersproject/abi";
import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { BaseBuilder, BaseBuildParams, BaseOrderInfo } from "../../base";
import * as Addresses from "../../../addresses";
import { Order } from "../../../order";
import * as Types from "../../../types";
import {
  BytesEmpty,
  getCurrentTimestamp,
  getRandomBytes,
  s,
} from "../../../../utils";

import Erc1155Abi from "../../../../common/abis/Erc1155.json";

// Wyvern V2 calldata:
// `safeTransferFrom(address from, address to, uint256 tokenId, uint256 amount, bytes data)`

const REPLACEMENT_PATTERN_BUY =
  // `safeTransferFrom` 4byte selector
  "0x00000000" +
  // `from` (empty)
  "f".repeat(64) +
  // `to` (required)
  "0".repeat(64) +
  // `tokenId` (required)
  "0".repeat(64) +
  // `amount` (required)
  "0".repeat(64) +
  // empty `data` (required)
  "0".repeat(128);

const REPLACEMENT_PATTERN_SELL =
  // `safeTransferFrom` 4byte selector
  "0x00000000" +
  // `from` (empty)
  "0".repeat(64) +
  // `to` (required)
  "f".repeat(64) +
  // `tokenId` (required)
  "0".repeat(64) +
  // `amount` (required)
  "0".repeat(64) +
  // empty `data` (required)
  "0".repeat(128);

interface BuildParams extends BaseBuildParams {
  contract: string;
  tokenId: BigNumberish;
}

interface OrderInfo extends BaseOrderInfo {
  tokenId: BigNumberish;
}

export class SingleTokenErc1155BuilderV1 extends BaseBuilder {
  constructor(chainId: number) {
    super(chainId);
  }

  public getInfo(order: Order): OrderInfo | undefined {
    try {
      const result = new Interface(Erc1155Abi).decodeFunctionData(
        "safeTransferFrom",
        order.params.calldata
      );
      return {
        contract: order.params.target,
        tokenId: result.id.toString(),
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
        tokenId: info.tokenId,
        side: order.params.side === Types.OrderSide.BUY ? "buy" : "sell",
        price: order.params.basePrice,
        fee: 0,
      });

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
      return new Order(this.chainId, {
        kind: "erc1155-single-token",
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
        calldata: new Interface(Erc1155Abi).encodeFunctionData(
          "safeTransferFrom",
          [
            AddressZero,
            params.recipient ?? params.maker,
            params.tokenId,
            1,
            "0x",
          ]
        ),
        replacementPattern: REPLACEMENT_PATTERN_BUY,
        staticTarget: AddressZero,
        staticExtradata: BytesEmpty,
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
      return new Order(this.chainId, {
        kind: "erc1155-single-token",
        exchange: Addresses.Exchange[this.chainId],
        maker: params.maker,
        taker: AddressZero,
        makerRelayerFee: params.fee,
        takerRelayerFee: 0,
        feeRecipient: params.feeRecipient,
        side: Types.OrderSide.SELL,
        saleKind,
        target: params.contract,
        howToCall: Types.OrderHowToCall.CALL,
        calldata: new Interface(Erc1155Abi).encodeFunctionData(
          "safeTransferFrom",
          [params.maker, AddressZero, params.tokenId, 1, "0x"]
        ),
        replacementPattern: REPLACEMENT_PATTERN_SELL,
        staticTarget: AddressZero,
        staticExtradata: BytesEmpty,
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
    } else {
      throw new Error("Invalid order side");
    }
  }

  public buildMatching(
    order: Order,
    taker: string,
    data: { nonce: string; recipient?: string }
  ) {
    const info = this.getInfo(order);
    if (!info) {
      throw new Error("Invalid order");
    }

    if (order.params.side === Types.OrderSide.BUY) {
      const matchingOrder = this.build({
        maker: taker,
        contract: info.contract,
        tokenId: info.tokenId,
        side: "sell",
        price: order.getMatchingPrice(),
        paymentToken: order.params.paymentToken,
        recipient: data.recipient,
        fee: 0,
        feeRecipient: AddressZero,
        listingTime: getCurrentTimestamp(-60),
        expirationTime: 0,
        salt: getRandomBytes(),
        nonce: data.nonce,
      });
      matchingOrder.params.takerRelayerFee = order.params.takerRelayerFee;

      return matchingOrder;
    } else if (order.params.side === Types.OrderSide.SELL) {
      const matchingOrder = this.build({
        maker: taker,
        contract: info.contract,
        tokenId: info.tokenId,
        side: "buy",
        price: order.getMatchingPrice(),
        paymentToken: order.params.paymentToken,
        recipient: data.recipient,
        fee: 0,
        feeRecipient: AddressZero,
        listingTime: getCurrentTimestamp(-60),
        expirationTime: 0,
        salt: getRandomBytes(),
        nonce: data.nonce,
      });
      matchingOrder.params.makerRelayerFee = order.params.makerRelayerFee;

      return matchingOrder;
    } else {
      throw new Error("Invalid order side");
    }
  }
}
