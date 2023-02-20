import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { splitSignature } from "@ethersproject/bytes";
import { HashZero } from "@ethersproject/constants";
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
  public params: Types.MakerOrderParams;

  constructor(chainId: number, params: Types.MakerOrderParams) {
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

    // Validate listing and expiration times
    if (this.params.startTime >= this.params.endTime) {
      throw new Error("Invalid listing and/or expiration time");
    }
  }

  public hash() {
    return _TypedDataEncoder.hashStruct(
      "MakerOrder",
      EIP712_TYPES,
      this.params
    );
  }

  public async sign(signer: TypedDataSigner) {
    const { v, r, s } = splitSignature(
      await signer._signTypedData(
        EIP712_DOMAIN(this.chainId),
        EIP712_TYPES,
        this.params
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

    if (lc(this.params.signer) !== lc(signer)) {
      throw new Error("Invalid signature");
    }
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  public async checkFillability(provider: Provider) {
    const chainId = await provider.getNetwork().then((n) => n.chainId);

    const exchange = new Contract(
      Addresses.Exchange[this.chainId],
      ExchangeAbi as any,
      provider
    );

    const executedOrCancelled =
      await exchange.isUserOrderNonceExecutedOrCancelled(
        this.params.signer,
        this.params.nonce
      );
    if (executedOrCancelled) {
      throw new Error("executed-or-cancelled");
    }

    if (this.params.isOrderAsk) {
      // Detect the collection kind (erc721 or erc1155)
      let kind: string | undefined;
      if (!kind) {
        const erc721 = new Common.Helpers.Erc721(
          provider,
          this.params.collection
        );
        if (await erc721.isValid()) {
          kind = "erc721";

          // Check ownership
          const owner = await erc721.getOwner(this.params.tokenId);
          if (lc(owner) !== lc(this.params.signer)) {
            throw new Error("no-balance");
          }

          // Check approval
          const isApproved = await erc721.isApproved(
            this.params.signer,
            Addresses.TransferManagerErc721[this.chainId]
          );
          if (!isApproved) {
            throw new Error("no-approval");
          }
        }
      }
      if (!kind) {
        const erc1155 = new Common.Helpers.Erc1155(
          provider,
          this.params.collection
        );
        if (await erc1155.isValid()) {
          kind = "erc1155";

          // Check balance
          const balance = await erc1155.getBalance(
            this.params.signer,
            this.params.tokenId
          );
          if (bn(balance).lt(1)) {
            throw new Error("no-balance");
          }

          // Check approval
          const isApproved = await erc1155.isApproved(
            this.params.signer,
            Addresses.TransferManagerErc1155[this.chainId]
          );
          if (!isApproved) {
            throw new Error("no-approval");
          }
        }
      }

      if (!kind) {
        throw new Error("invalid");
      }
    } else {
      // Check that maker has enough balance to cover the payment
      // and the approval to the token transfer proxy is set
      const erc20 = new Common.Helpers.Erc20(provider, this.params.currency);
      const balance = await erc20.getBalance(this.params.signer);
      if (bn(balance).lt(this.params.price)) {
        throw new Error("no-balance");
      }

      // Check allowance
      const allowance = await erc20.getAllowance(
        this.params.signer,
        Addresses.Exchange[chainId]
      );
      if (bn(allowance).lt(this.params.price)) {
        throw new Error("no-approval");
      }
    }
  }

  public buildMatching(taker: string, data?: any) {
    return this.getBuilder().buildMatching(this, taker, data);
  }

  private getBuilder(): BaseBuilder {
    switch (this.params.kind) {
      case "single-token": {
        return new Builders.SingleToken(this.chainId);
      }

      case "contract-wide": {
        return new Builders.ContractWide(this.chainId);
      }

      default: {
        throw new Error("Unknown order kind");
      }
    }
  }

  private detectKind(): Types.OrderKind {
    // single-token
    {
      const builder = new Builders.SingleToken(this.chainId);
      if (builder.isValid(this)) {
        return "single-token";
      }
    }

    // contract-wide
    {
      const builder = new Builders.ContractWide(this.chainId);
      if (builder.isValid(this)) {
        return "contract-wide";
      }
    }

    throw new Error(
      "Could not detect order kind (order might have unsupported params/calldata)"
    );
  }
}

const EIP712_DOMAIN = (chainId: number) => ({
  name: "LooksRareExchange",
  version: "1",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

const EIP712_TYPES = {
  MakerOrder: [
    { name: "isOrderAsk", type: "bool" },
    { name: "signer", type: "address" },
    { name: "collection", type: "address" },
    { name: "price", type: "uint256" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "strategy", type: "address" },
    { name: "currency", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "minPercentageToAsk", type: "uint256" },
    { name: "params", type: "bytes" },
  ],
};

const toRawOrder = (order: Order): any => ({
  ...order.params,
});

const normalize = (order: Types.MakerOrderParams): Types.MakerOrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    kind: order.kind,
    isOrderAsk: order.isOrderAsk,
    signer: lc(order.signer),
    collection: lc(order.collection),
    price: s(order.price),
    tokenId: s(order.tokenId),
    amount: s(order.amount),
    strategy: lc(order.strategy),
    currency: lc(order.currency),
    nonce: s(order.nonce),
    startTime: n(order.startTime),
    endTime: n(order.endTime),
    minPercentageToAsk: n(order.minPercentageToAsk),
    params: lc(order.params),
    v: order.v ?? 0,
    r: order.r ?? HashZero,
    s: order.s ?? HashZero,
  };
};
