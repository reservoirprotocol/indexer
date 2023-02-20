import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { BigNumberish } from "@ethersproject/bignumber";
import { splitSignature } from "@ethersproject/bytes";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Addresses from "./addresses";
import { ProxyRegistry } from "./helpers";
import { Builders } from "./builders";
import { BaseBuilder, BaseOrderInfo } from "./builders/base";
import * as Types from "./types";
import * as Common from "../common";
import { bn, lc, getCurrentTimestamp, n, s } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

export class Order {
  public chainId: number;
  public params: Types.OrderParams;

  constructor(chainId: number, params: Types.OrderParams) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }

    // Detect kind
    if (!params.kind) {
      this.params.kind = this.detectKind();
    }

    // Perform light validations

    // Validate fees
    if (
      this.params.makerRelayerFee > 10000 ||
      this.params.takerRelayerFee > 10000
    ) {
      throw new Error("Invalid fees");
    }

    // Validate side
    if (
      this.params.side !== Types.OrderSide.BUY &&
      this.params.side !== Types.OrderSide.SELL
    ) {
      throw new Error("Invalid side");
    }

    // Validate sale kind
    if (
      this.params.saleKind !== Types.OrderSaleKind.FIXED_PRICE &&
      this.params.saleKind !== Types.OrderSaleKind.DUTCH_AUCTION
    ) {
      throw new Error("Invalid sale kind");
    }

    // Validate call method
    if (
      this.params.howToCall !== Types.OrderHowToCall.CALL &&
      this.params.howToCall !== Types.OrderHowToCall.DELEGATE_CALL
    ) {
      throw new Error("Invalid call method");
    }

    // Validate listing and expiration times
    if (
      this.params.expirationTime !== 0 &&
      this.params.listingTime >= this.params.expirationTime
    ) {
      throw new Error("Invalid listing and/or expiration time");
    }

    // Validate exchange
    if (this.params.exchange !== Addresses.Exchange[this.chainId]) {
      throw new Error("Invalid exchange");
    }
  }

  public hash() {
    return _TypedDataEncoder.hashStruct(
      "Order",
      EIP712_TYPES,
      toRawOrder(this)
    );
  }

  public prefixHash() {
    return _TypedDataEncoder.hash(
      EIP712_DOMAIN(this.chainId),
      EIP712_TYPES,
      toRawOrder(this)
    );
  }

  public async sign(signer: TypedDataSigner) {
    const { v, r, s } = splitSignature(
      await signer._signTypedData(
        EIP712_DOMAIN(this.chainId),
        EIP712_TYPES,
        toRawOrder(this)
      )
    );

    this.params = {
      ...this.params,
      v,
      r,
      s,
    };
  }

  public getSignatureData() {
    return {
      signatureKind: "eip712",
      domain: EIP712_DOMAIN(this.chainId),
      types: EIP712_TYPES,
      value: toRawOrder(this),
    };
  }

  /**
   * Build a matching buy order for a sell order and vice versa
   * @param taker The taker's Ethereum address
   * @param data Any aditional arguments
   * @returns The matching Wyvern v2 order
   */
  public buildMatching(taker: string, data?: any) {
    return this.getBuilder().buildMatching(this, taker, data);
  }

  /**
   * Check the validity of the order's signature
   */
  public checkSignature() {
    const signer = verifyTypedData(
      EIP712_DOMAIN(this.chainId),
      EIP712_TYPES,
      toRawOrder(this),
      {
        v: this.params.v,
        r: this.params.r ?? "",
        s: this.params.s ?? "",
      }
    );

    if (lc(this.params.maker) !== lc(signer)) {
      throw new Error("Invalid signature");
    }
  }

  /**
   * Check the order's validity
   */
  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  public getInfo(): BaseOrderInfo | undefined {
    return this.getBuilder().getInfo(this);
  }

  public getMatchingPrice(timestampOverride?: number): BigNumberish {
    // https://github.com/ProjectWyvern/wyvern-ethereum/blob/bfca101b2407e4938398fccd8d1c485394db7e01/contracts/exchange/SaleKindInterface.sol#L70-L87
    if (this.params.saleKind === Types.OrderSaleKind.FIXED_PRICE) {
      return bn(this.params.basePrice);
    } else {
      // Set a delay of 1 minute to allow for any timestamp discrepancies
      const diff = bn(this.params.extra)
        .mul(
          bn(timestampOverride ?? getCurrentTimestamp(-60)).sub(
            this.params.listingTime
          )
        )
        .div(bn(this.params.expirationTime).sub(this.params.listingTime));
      return bn(this.params.basePrice).sub(diff);
    }
  }

  public isDutchAuction(): boolean {
    return this.params.saleKind === Types.OrderSaleKind.DUTCH_AUCTION;
  }

  /**
   * Check the order's fillability
   * @param provider A read-only abstraction to access the blockchain data
   */
  public async checkFillability(provider: Provider) {
    const chainId = await provider.getNetwork().then((n) => n.chainId);

    // Make sure the order is not cancelled or filled
    const hash = this.prefixHash();
    const exchange = new Contract(
      this.params.exchange,
      ExchangeAbi as any,
      provider
    );
    const filledOrCancelled = await exchange.cancelledOrFinalized(hash);
    if (filledOrCancelled) {
      throw new Error("filled-or-cancelled");
    }

    // Make sure the order has a valid nonce
    const nonce = await exchange.nonces(this.params.maker);
    if (nonce.toString() !== this.params.nonce) {
      throw new Error("nonce-invalidated");
    }

    if (this.params.side === Types.OrderSide.BUY) {
      // Check that maker has enough balance to cover the payment
      // and the approval to the token transfer proxy is set

      const erc20 = new Common.Helpers.Erc20(
        provider,
        this.params.paymentToken
      );

      // Check balance
      const balance = await erc20.getBalance(this.params.maker);
      if (bn(balance).lt(this.params.basePrice)) {
        throw new Error("no-balance");
      }

      // Check allowance
      const allowance = await erc20.getAllowance(
        this.params.maker,
        Addresses.TokenTransferProxy[chainId]
      );
      if (bn(allowance).lt(this.params.basePrice)) {
        throw new Error("no-approval");
      }
    } else {
      // Check that maker owns the token id put on sale and
      // the approval to the make'rs proxy is set

      const proxyRegistry = new ProxyRegistry(provider, chainId);
      const proxy = await proxyRegistry.getProxy(this.params.maker);
      if (!proxy) {
        throw new Error("no-proxy");
      }

      let kind: string | undefined;
      if (this.params.kind?.startsWith("erc721")) {
        kind = "erc721";
      } else if (this.params.kind?.startsWith("erc1155")) {
        kind = "erc1155";
      } else {
        throw new Error("invalid");
      }

      const { contract, tokenId } = this.getInfo() as any;
      if (!contract || !tokenId) {
        throw new Error("invalid");
      }

      if (kind === "erc721") {
        const erc721 = new Common.Helpers.Erc721(provider, contract);

        // Check ownership
        const owner = await erc721.getOwner(tokenId);
        if (lc(owner) !== lc(this.params.maker)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc721.isApproved(this.params.maker, proxy);
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else if (kind === "erc1155") {
        const erc1155 = new Common.Helpers.Erc1155(provider, contract);

        // Check balance
        const balance = await erc1155.getBalance(this.params.maker, tokenId);
        if (bn(balance).lt(1)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc1155.isApproved(this.params.maker, proxy);
        if (!isApproved) {
          throw new Error("no-approval");
        }
      }
    }
  }

  private getBuilder(): BaseBuilder {
    switch (this.params.kind) {
      case "erc721-contract-wide": {
        return new Builders.Erc721.ContractWide(this.chainId);
      }

      case "erc721-single-token": {
        return new Builders.Erc721.SingleToken.V1(this.chainId);
      }

      case "erc721-single-token-v2": {
        return new Builders.Erc721.SingleToken.V2(this.chainId);
      }

      case "erc721-token-list": {
        return new Builders.Erc721.TokenList(this.chainId);
      }

      case "erc721-token-range": {
        return new Builders.Erc721.TokenRange(this.chainId);
      }

      case "erc1155-contract-wide": {
        return new Builders.Erc1155.ContractWide(this.chainId);
      }

      case "erc1155-single-token": {
        return new Builders.Erc1155.SingleToken.V1(this.chainId);
      }

      case "erc1155-single-token-v2": {
        return new Builders.Erc1155.SingleToken.V2(this.chainId);
      }

      case "erc1155-token-list": {
        return new Builders.Erc1155.TokenList(this.chainId);
      }

      case "erc1155-token-range": {
        return new Builders.Erc1155.TokenRange(this.chainId);
      }

      default: {
        throw new Error("Unknown order kind");
      }
    }
  }

  private detectKind(): Types.OrderKind {
    // erc721-contract-wide
    {
      const builder = new Builders.Erc721.ContractWide(this.chainId);
      if (builder.isValid(this)) {
        return "erc721-contract-wide";
      }
    }

    // erc721-single-token
    {
      const builder = new Builders.Erc721.SingleToken.V1(this.chainId);
      if (builder.isValid(this)) {
        return "erc721-single-token";
      }
    }

    // erc721-single-token-v2
    {
      const builder = new Builders.Erc721.SingleToken.V2(this.chainId);
      if (builder.isValid(this)) {
        return "erc721-single-token-v2";
      }
    }

    // erc721-token-list
    {
      const builder = new Builders.Erc721.TokenList(this.chainId);
      if (builder.isValid(this)) {
        return "erc721-token-list";
      }
    }

    // erc721-token-range
    {
      const builder = new Builders.Erc721.TokenRange(this.chainId);
      if (builder.isValid(this)) {
        return "erc721-token-range";
      }
    }

    // erc1155-contract-wide
    {
      const builder = new Builders.Erc1155.ContractWide(this.chainId);
      if (builder.isValid(this)) {
        return "erc1155-contract-wide";
      }
    }

    // erc1155-single-token
    {
      const builder = new Builders.Erc1155.SingleToken.V1(this.chainId);
      if (builder.isValid(this)) {
        return "erc1155-single-token";
      }
    }

    // erc1155-single-token-v2
    {
      const builder = new Builders.Erc1155.SingleToken.V2(this.chainId);
      if (builder.isValid(this)) {
        return "erc1155-single-token-v2";
      }
    }

    // erc1155-token-list
    {
      const builder = new Builders.Erc1155.TokenList(this.chainId);
      if (builder.isValid(this)) {
        return "erc1155-token-list";
      }
    }

    // erc1155-token-range
    {
      const builder = new Builders.Erc1155.TokenRange(this.chainId);
      if (builder.isValid(this)) {
        return "erc1155-token-range";
      }
    }

    throw new Error(
      "Could not detect order kind (order might have unsupported params/calldata)"
    );
  }
}

const EIP712_DOMAIN = (chainId: number) => ({
  name: "Wyvern Exchange Contract",
  version: "2.3",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

const EIP712_TYPES = {
  Order: [
    { name: "exchange", type: "address" },
    { name: "maker", type: "address" },
    { name: "taker", type: "address" },
    { name: "makerRelayerFee", type: "uint256" },
    { name: "takerRelayerFee", type: "uint256" },
    { name: "makerProtocolFee", type: "uint256" },
    { name: "takerProtocolFee", type: "uint256" },
    { name: "feeRecipient", type: "address" },
    { name: "feeMethod", type: "uint8" },
    { name: "side", type: "uint8" },
    { name: "saleKind", type: "uint8" },
    { name: "target", type: "address" },
    { name: "howToCall", type: "uint8" },
    { name: "calldata", type: "bytes" },
    { name: "replacementPattern", type: "bytes" },
    { name: "staticTarget", type: "address" },
    { name: "staticExtradata", type: "bytes" },
    { name: "paymentToken", type: "address" },
    { name: "basePrice", type: "uint256" },
    { name: "extra", type: "uint256" },
    { name: "listingTime", type: "uint256" },
    { name: "expirationTime", type: "uint256" },
    { name: "salt", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};

const toRawOrder = (order: Order): any => ({
  ...order.params,
  makerProtocolFee: 0,
  takerProtocolFee: 0,
  feeMethod: 1,
});

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    kind: order.kind,
    exchange: lc(order.exchange),
    maker: lc(order.maker),
    taker: lc(order.taker),
    makerRelayerFee: n(order.makerRelayerFee),
    takerRelayerFee: n(order.takerRelayerFee),
    feeRecipient: lc(order.feeRecipient),
    side: n(order.side),
    saleKind: n(order.saleKind),
    target: lc(order.target),
    howToCall: n(order.howToCall),
    calldata: lc(order.calldata),
    replacementPattern: lc(order.replacementPattern),
    staticTarget: lc(order.staticTarget),
    staticExtradata: lc(order.staticExtradata),
    paymentToken: lc(order.paymentToken),
    basePrice: s(order.basePrice),
    extra: s(order.extra),
    listingTime: n(order.listingTime),
    expirationTime: n(order.expirationTime),
    salt: s(order.salt),
    nonce: s(order.nonce),
    v: order.v ?? 0,
    r: order.r ?? HashZero,
    s: order.s ?? HashZero,
  };
};
