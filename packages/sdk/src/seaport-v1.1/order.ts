import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Common from "../common";
import { Exchange } from "./exchange";
import { Builders } from "../seaport-base/builders";
import { BaseBuilder, BaseOrderInfo } from "../seaport-base/builders/base";
import { IOrder, ORDER_EIP712_TYPES } from "../seaport-base/order";
import * as Types from "../seaport-base/types";
import { bn, lc, n, s } from "../utils";
import {
  computeReceivedItems,
  isCosignedOrder,
  isPrivateOrder,
  constructPrivateListingCounterOrder,
  getPrivateListingFulfillments,
  computeDynamicPrice,
} from "../seaport-base/helpers";

export class Order implements IOrder {
  public chainId: number;
  public params: Types.OrderComponents;

  constructor(chainId: number, params: Types.OrderComponents) {
    this.chainId = chainId;

    // Normalize
    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }

    // Detect kind (if missing)
    if (!params.kind) {
      this.params.kind = this.detectKind();
    }

    // Fix signature
    this.fixSignature();
  }

  // Public methods

  public exchange() {
    return new Exchange(this.chainId);
  }

  public hash() {
    return _TypedDataEncoder.hashStruct("OrderComponents", ORDER_EIP712_TYPES, this.params);
  }

  public async sign(signer: TypedDataSigner) {
    const signature = await signer._signTypedData(
      this.exchange().eip712Domain(),
      ORDER_EIP712_TYPES,
      this.params
    );

    this.params = {
      ...this.params,
      signature,
    };
  }

  public getSignatureData() {
    return {
      signatureKind: "eip712",
      domain: this.exchange().eip712Domain(),
      types: ORDER_EIP712_TYPES,
      value: this.params,
      primaryType: _TypedDataEncoder.getPrimaryType(ORDER_EIP712_TYPES),
    };
  }

  public async checkSignature(provider?: Provider) {
    try {
      const signer = verifyTypedData(
        this.exchange().eip712Domain(),
        ORDER_EIP712_TYPES,
        this.params,
        this.params.signature!
      );

      if (lc(this.params.offerer) !== lc(signer)) {
        throw new Error("Invalid signature");
      }
    } catch {
      if (!provider) {
        throw new Error("Invalid signature");
      }

      const eip712Hash = _TypedDataEncoder.hash(
        this.exchange().eip712Domain(),
        ORDER_EIP712_TYPES,
        this.params
      );

      const iface = new Interface([
        "function isValidSignature(bytes32 digest, bytes signature) view returns (bytes4)",
      ]);

      const result = await new Contract(this.params.offerer, iface, provider).isValidSignature(
        eip712Hash,
        this.params.signature!
      );
      if (result !== iface.getSighash("isValidSignature")) {
        throw new Error("Invalid signature");
      }
    }
  }

  public checkValidity() {
    const info = this.getInfo();
    if (!info) {
      throw new Error("Could not extract order info");
    }

    if (!bn(info.price).div(info.amount).mul(info.amount).eq(info.price)) {
      throw new Error("Price not evenly divisible to the amount");
    }

    if (!this.getBuilder().isValid(this, Order)) {
      throw new Error("Invalid order");
    }
  }

  public getInfo(): BaseOrderInfo | undefined {
    return this.getBuilder().getInfo(this);
  }

  public getMatchingPrice(timestampOverride?: number): BigNumberish {
    const info = this.getInfo();
    if (!info) {
      throw new Error("Could not get order info");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(info as any).isDynamic) {
      if (info.side === "buy") {
        return bn(info.price);
      } else {
        return bn(info.price).add(this.getFeeAmount());
      }
    } else {
      return computeDynamicPrice(info.side === "buy", this.params, timestampOverride);
    }
  }

  public getFeeAmount(): BigNumber {
    const { fees } = this.getBuilder()!.getInfo(this)!;

    let feeAmount = bn(0);
    for (const { amount } of fees) {
      feeAmount = feeAmount.add(amount);
    }
    return feeAmount;
  }

  public buildMatching(data?: object) {
    return this.getBuilder().buildMatching(this, data);
  }

  public async checkFillability(provider: Provider) {
    const status = await this.exchange().contract.connect(provider).getOrderStatus(this.hash());
    if (status.isCancelled) {
      throw new Error("not-fillable");
    }
    if (status.isValidated && bn(status.totalFilled).gte(status.totalSize)) {
      throw new Error("not-fillable");
    }

    const makerConduit = this.exchange().deriveConduit(this.params.conduitKey);

    const info = this.getInfo()! as BaseOrderInfo;
    if (info.side === "buy") {
      // Check that maker has enough balance to cover the payment
      // and the approval to the corresponding conduit is set
      const erc20 = new Common.Helpers.Erc20(provider, info.paymentToken);
      const balance = await erc20.getBalance(this.params.offerer);
      if (bn(balance).lt(info.price)) {
        throw new Error("no-balance");
      }

      // Check allowance
      const allowance = await erc20.getAllowance(this.params.offerer, makerConduit);
      if (bn(allowance).lt(info.price)) {
        throw new Error("no-approval");
      }
    } else {
      if (info.tokenKind === "erc721") {
        const erc721 = new Common.Helpers.Erc721(provider, info.contract);

        // Check ownership
        const owner = await erc721.getOwner(info.tokenId!);
        if (lc(owner) !== lc(this.params.offerer)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc721.isApproved(this.params.offerer, makerConduit);
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else {
        const erc1155 = new Common.Helpers.Erc1155(provider, info.contract);

        // Check balance
        const balance = await erc1155.getBalance(this.params.offerer, info.tokenId!);
        if (bn(balance).lt(info.amount)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc1155.isApproved(this.params.offerer, makerConduit);
        if (!isApproved) {
          throw new Error("no-approval");
        }
      }
    }
  }

  public getPrivateListingFulfillments(orderIndex = 0): Types.MatchOrdersFulfillment[] {
    return getPrivateListingFulfillments(this.params, orderIndex);
  }

  public isPrivateOrder() {
    return isPrivateOrder(this.params);
  }

  public isCosignedOrder() {
    return isCosignedOrder(this.params, this.chainId);
  }

  public getReceivedItems(matchParams: Types.MatchParams): Types.ReceivedItem[] {
    return computeReceivedItems(this, matchParams);
  }

  public constructPrivateListingCounterOrder(
    orderMaker: string,
    privateSaleRecipient: string,
    conduitKey: string
  ): Types.OrderWithCounter {
    return constructPrivateListingCounterOrder(
      orderMaker,
      privateSaleRecipient,
      conduitKey,
      this.params
    );
  }

  // Private methods

  private getBuilder(): BaseBuilder {
    switch (this.params.kind) {
      case "contract-wide": {
        return new Builders.ContractWide(this.chainId);
      }

      case "single-token": {
        return new Builders.SingleToken(this.chainId);
      }

      case "token-list": {
        return new Builders.TokenList(this.chainId);
      }

      default: {
        throw new Error("Unknown order kind");
      }
    }
  }

  private detectKind(): Types.OrderKind {
    // contract-wide
    {
      const builder = new Builders.ContractWide(this.chainId);
      if (builder.isValid(this, Order)) {
        return "contract-wide";
      }
    }

    // single-token
    {
      const builder = new Builders.SingleToken(this.chainId);
      if (builder.isValid(this, Order)) {
        return "single-token";
      }
    }

    // token-list
    {
      const builder = new Builders.TokenList(this.chainId);
      if (builder.isValid(this, Order)) {
        return "token-list";
      }
    }

    throw new Error("Could not detect order kind (order might have unsupported params/calldata)");
  }

  private fixSignature() {
    // Ensure `v` is always 27 or 28 (Seaport will revert otherwise)
    if (this.params.signature?.length === 132) {
      let lastByte = parseInt(this.params.signature.slice(-2), 16);
      if (lastByte < 27) {
        if (lastByte === 0 || lastByte === 1) {
          lastByte += 27;
        } else {
          throw new Error("Invalid `v` byte");
        }

        this.params.signature = this.params.signature.slice(0, -2) + lastByte.toString(16);
      }
    }
  }
}

const normalize = (order: Types.OrderComponents): Types.OrderComponents => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    kind: order.kind,
    offerer: lc(order.offerer),
    zone: lc(order.zone),
    offer: order.offer.map((o) => ({
      itemType: n(o.itemType),
      token: lc(o.token),
      identifierOrCriteria: s(o.identifierOrCriteria),
      startAmount: s(o.startAmount),
      endAmount: s(o.endAmount),
    })),
    consideration: order.consideration.map((c) => ({
      itemType: n(c.itemType),
      token: lc(c.token),
      identifierOrCriteria: s(c.identifierOrCriteria),
      startAmount: s(c.startAmount),
      endAmount: s(c.endAmount),
      recipient: lc(c.recipient),
    })),
    orderType: n(order.orderType),
    startTime: n(order.startTime),
    endTime: n(order.endTime),
    zoneHash: lc(order.zoneHash),
    salt: s(order.salt),
    conduitKey: lc(order.conduitKey),
    counter: s(order.counter),
    signature: order.signature ? lc(order.signature) : undefined,
    extraData: order.extraData ? lc(order.extraData) : undefined,
  };
};
