import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder } from "./builders/base";
import * as Types from "./types";
import * as Common from "../common";
import { bn, lc, n, s } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

export class Order {
  public chainId: number;
  public params: Types.Order;

  constructor(chainId: number, params: Types.Order) {
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

  public hash() {
    return _TypedDataEncoder.hashStruct(
      "Order",
      ORDER_EIP712_TYPES,
      this.params
    );
  }

  public async sign(signer: TypedDataSigner) {
    const signature = await signer._signTypedData(
      EIP712_DOMAIN(this.chainId),
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
      domain: EIP712_DOMAIN(this.chainId),
      types: ORDER_EIP712_TYPES,
      value: this.params,
    };
  }

  public checkSignature() {
    const signer = verifyTypedData(
      EIP712_DOMAIN(this.chainId),
      ORDER_EIP712_TYPES,
      this.params,
      this.params.signature!
    );

    if (lc(this.params.maker) !== lc(signer)) {
      throw new Error("Invalid signature");
    }
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  public buildMatching(data?: any) {
    return this.getBuilder().buildMatching(this, data);
  }

  public async checkFillability(provider: Provider) {
    const exchange = new Contract(
      Addresses.Exchange[this.chainId],
      ExchangeAbi as any,
      provider
    );

    const status = await exchange.orderStatuses(this.hash());
    if (status.isCancelled) {
      throw new Error("cancelled");
    }
    if (bn(status.filledAmount).gte(this.params.amount)) {
      throw new Error("filled");
    }

    // Check balance
    const erc20 = new Common.Helpers.Erc20(
      provider,
      Common.Addresses.Weth[this.chainId]
    );
    const balance = await erc20.getBalance(this.params.maker);
    if (bn(balance).lt(bn(this.params.unitPrice).mul(this.params.amount))) {
      throw new Error("no-balance");
    }

    // Check allowance
    const allowance = await erc20.getAllowance(
      this.params.maker,
      exchange.address
    );
    if (bn(allowance).lt(bn(this.params.unitPrice).mul(this.params.amount))) {
      throw new Error("no-approval");
    }
  }

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
      if (builder.isValid(this)) {
        return "contract-wide";
      }
    }

    // single-token
    {
      const builder = new Builders.SingleToken(this.chainId);
      if (builder.isValid(this)) {
        return "single-token";
      }
    }

    // token-list
    {
      const builder = new Builders.TokenList(this.chainId);
      if (builder.isValid(this)) {
        return "token-list";
      }
    }

    throw new Error(
      "Could not detect order kind (order might have unsupported params/calldata)"
    );
  }
}

const EIP712_DOMAIN = (chainId: number) => ({
  name: "Forward",
  version: "1.0",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

export const ORDER_EIP712_TYPES = {
  Order: [
    { name: "itemKind", type: "uint8" },
    { name: "maker", type: "address" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "unitPrice", type: "uint256" },
    { name: "amount", type: "uint128" },
    { name: "salt", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "counter", type: "uint256" },
  ],
};

const normalize = (order: Types.Order): Types.Order => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    kind: order.kind,
    itemKind: n(order.itemKind),
    maker: lc(order.maker),
    token: lc(order.token),
    identifierOrCriteria: s(order.identifierOrCriteria),
    unitPrice: s(order.unitPrice),
    amount: s(order.amount),
    salt: s(order.salt),
    expiration: s(order.expiration),
    counter: s(order.counter),
    signature: order.signature ? lc(order.signature) : undefined,
  };
};
