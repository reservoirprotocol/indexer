import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { BigNumber } from "@ethersproject/bignumber";
import { splitSignature } from "@ethersproject/bytes";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder, BaseOrderInfo } from "./builders/base";
import * as Types from "./types";
import * as Common from "../common";
import { bn, lc, n, s } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

export class Order {
  public chainId: number;
  public params: Types.BaseOrder;

  constructor(chainId: number, params: Types.BaseOrder) {
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
  }

  public getRaw() {
    return this.params.kind?.startsWith("erc721")
      ? toRawErc721Order(this)
      : toRawErc1155Order(this);
  }

  public hash() {
    const [types, value, structName] = this.getEip712TypesAndValue();
    return _TypedDataEncoder.hashStruct(structName, types, value);
  }

  public async sign(signer: TypedDataSigner) {
    const [types, value] = this.getEip712TypesAndValue();

    const { v, r, s } = splitSignature(
      await signer._signTypedData(EIP712_DOMAIN(this.chainId), types, value)
    );

    this.params = {
      ...this.params,
      signatureType: 2,
      v,
      r,
      s,
    };
  }

  public getSignatureData() {
    const [types, value] = this.getEip712TypesAndValue();
    return {
      signatureKind: "eip712",
      domain: EIP712_DOMAIN(this.chainId),
      types,
      value,
    };
  }

  public checkSignature() {
    const [types, value] = this.getEip712TypesAndValue();

    const signer = verifyTypedData(EIP712_DOMAIN(this.chainId), types, value, {
      v: this.params.v,
      r: this.params.r ?? "",
      s: this.params.s ?? "",
    });

    if (lc(this.params.maker) !== lc(signer)) {
      throw new Error("Invalid signature");
    }
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  public getInfo(): BaseOrderInfo | undefined {
    return this.getBuilder().getInfo(this);
  }

  public async checkFillability(provider: Provider) {
    const chainId = await provider.getNetwork().then((n) => n.chainId);

    const exchange = new Contract(
      Addresses.Exchange[this.chainId],
      ExchangeAbi as any,
      provider
    );

    let status: number | undefined;
    if (this.params.kind?.startsWith("erc721")) {
      status = await exchange.getERC721OrderStatus(toRawErc721Order(this));
    } else {
      ({ status } = await exchange.getERC1155OrderInfo(
        toRawErc1155Order(this)
      ));
    }

    if (status !== 1) {
      throw new Error("not-fillable");
    }

    // Determine the order's fees (which are to be payed by the buyer)
    let feeAmount = this.getFeeAmount();

    if (this.params.direction === Types.TradeDirection.BUY) {
      // Check that maker has enough balance to cover the payment
      // and the approval to the token transfer proxy is set
      const erc20 = new Common.Helpers.Erc20(provider, this.params.erc20Token);
      const balance = await erc20.getBalance(this.params.maker);
      if (bn(balance).lt(bn(this.params.erc20TokenAmount).add(feeAmount))) {
        throw new Error("no-balance");
      }

      // Check allowance
      const allowance = await erc20.getAllowance(
        this.params.maker,
        Addresses.Exchange[chainId]
      );
      if (bn(allowance).lt(bn(this.params.erc20TokenAmount).add(feeAmount))) {
        throw new Error("no-approval");
      }
    } else {
      if (this.params.kind?.startsWith("erc721")) {
        const erc721 = new Common.Helpers.Erc721(provider, this.params.nft);

        // Check ownership
        const owner = await erc721.getOwner(this.params.nftId);
        if (lc(owner) !== lc(this.params.maker)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc721.isApproved(
          this.params.maker,
          Addresses.Exchange[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else {
        const erc1155 = new Common.Helpers.Erc1155(provider, this.params.nft);

        // Check balance
        const balance = await erc1155.getBalance(
          this.params.maker,
          this.params.nftId
        );
        if (bn(balance).lt(this.params.nftAmount!)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc1155.isApproved(
          this.params.maker,
          Addresses.Exchange[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      }
    }
  }

  public buildMatching(data?: any) {
    return this.getBuilder().buildMatching(this, data);
  }

  public getFeeAmount(): BigNumber {
    let feeAmount = bn(0);
    for (const { amount } of this.params.fees) {
      feeAmount = feeAmount.add(amount);
    }
    return feeAmount;
  }

  private getEip712TypesAndValue() {
    return !this.params.nftAmount
      ? [ERC721_ORDER_EIP712_TYPES, toRawErc721Order(this), "ERC721Order"]
      : [ERC1155_ORDER_EIP712_TYPES, toRawErc1155Order(this), "ERC1155Order"];
  }

  private getBuilder(): BaseBuilder {
    switch (this.params.kind) {
      case "erc721-contract-wide":
      case "erc1155-contract-wide": {
        return new Builders.ContractWide(this.chainId);
      }

      case "erc721-single-token":
      case "erc1155-single-token": {
        return new Builders.SingleToken(this.chainId);
      }

      case "erc721-token-range":
      case "erc1155-token-range": {
        return new Builders.TokenRange(this.chainId);
      }

      case "erc721-token-list-bit-vector":
      case "erc1155-token-list-bit-vector": {
        return new Builders.TokenList.BitVector(this.chainId);
      }

      case "erc721-token-list-packed-list":
      case "erc1155-token-list-packed-list": {
        return new Builders.TokenList.PackedList(this.chainId);
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
      if (builder.isValid(this)) {
        return this.params.nftAmount
          ? "erc1155-contract-wide"
          : "erc721-contract-wide";
      }
    }

    // single-token
    {
      const builder = new Builders.SingleToken(this.chainId);
      if (builder.isValid(this)) {
        return this.params.nftAmount
          ? "erc1155-single-token"
          : "erc721-single-token";
      }
    }

    // token-range
    {
      const builder = new Builders.TokenRange(this.chainId);
      if (builder.isValid(this)) {
        return this.params.nftAmount
          ? "erc1155-token-range"
          : "erc721-token-range";
      }
    }

    // token-list
    {
      const builder = new Builders.TokenList.BitVector(this.chainId);
      if (builder.isValid(this)) {
        return this.params.nftAmount
          ? "erc1155-token-list-bit-vector"
          : "erc721-token-list-bit-vector";
      }
    }
    {
      const builder = new Builders.TokenList.PackedList(this.chainId);
      if (builder.isValid(this)) {
        return this.params.nftAmount
          ? "erc1155-token-list-packed-list"
          : "erc721-token-list-packed-list";
      }
    }

    throw new Error(
      "Could not detect order kind (order might have unsupported params/calldata)"
    );
  }
}

const EIP712_DOMAIN = (chainId: number) => ({
  name: "ZeroEx",
  version: "1.0.0",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

const ERC721_ORDER_EIP712_TYPES = {
  ERC721Order: [
    { name: "direction", type: "uint8" },
    { name: "maker", type: "address" },
    { name: "taker", type: "address" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "erc20Token", type: "address" },
    { name: "erc20TokenAmount", type: "uint256" },
    { name: "fees", type: "Fee[]" },
    { name: "erc721Token", type: "address" },
    { name: "erc721TokenId", type: "uint256" },
    { name: "erc721TokenProperties", type: "Property[]" },
  ],
  Fee: [
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "feeData", type: "bytes" },
  ],
  Property: [
    { name: "propertyValidator", type: "address" },
    { name: "propertyData", type: "bytes" },
  ],
};

const ERC1155_ORDER_EIP712_TYPES = {
  ERC1155Order: [
    { name: "direction", type: "uint8" },
    { name: "maker", type: "address" },
    { name: "taker", type: "address" },
    { name: "expiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "erc20Token", type: "address" },
    { name: "erc20TokenAmount", type: "uint256" },
    { name: "fees", type: "Fee[]" },
    { name: "erc1155Token", type: "address" },
    { name: "erc1155TokenId", type: "uint256" },
    { name: "erc1155TokenProperties", type: "Property[]" },
    { name: "erc1155TokenAmount", type: "uint128" },
  ],
  Fee: [
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "feeData", type: "bytes" },
  ],
  Property: [
    { name: "propertyValidator", type: "address" },
    { name: "propertyData", type: "bytes" },
  ],
};

const toRawErc721Order = (order: Order): any => ({
  ...order.params,
  erc721Token: order.params.nft,
  erc721TokenId: order.params.nftId,
  erc721TokenProperties: order.params.nftProperties,
});

const toRawErc1155Order = (order: Order): any => ({
  ...order.params,
  erc1155Token: order.params.nft,
  erc1155TokenId: order.params.nftId,
  erc1155TokenProperties: order.params.nftProperties,
  erc1155TokenAmount: order.params.nftAmount,
});

const normalize = (order: Types.BaseOrder): Types.BaseOrder => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    kind: order.kind,
    cbOrderId: order.cbOrderId,
    direction: order.direction,
    maker: lc(order.maker),
    taker: lc(order.taker),
    expiry: n(order.expiry),
    nonce: s(order.nonce),
    erc20Token: lc(order.erc20Token),
    erc20TokenAmount: s(order.erc20TokenAmount),
    fees: order.fees.map(({ recipient, amount, feeData }) => ({
      recipient: lc(recipient),
      amount: s(amount),
      feeData: lc(feeData),
    })),
    nft: lc(order.nft),
    nftId: s(order.nftId),
    nftProperties: order.nftProperties.map(
      ({ propertyValidator, propertyData }) => ({
        propertyValidator: lc(propertyValidator),
        propertyData: lc(propertyData),
      })
    ),
    nftAmount: order.nftAmount ? s(order.nftAmount) : undefined,
    signatureType: order.signatureType ?? 1,
    v: order.v ?? 0,
    r: order.r ?? HashZero,
    s: order.s ?? HashZero,
  };
};
