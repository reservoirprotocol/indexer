import { _TypedDataEncoder } from "@ethersproject/hash";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { Addresses, Types } from ".";
//import * as Addresses from "./addresses";
import { bn, lc, n, s } from "../utils";
import { Exchange } from "./exchange";
import { verifyTypedData } from "@ethersproject/wallet";
import { SingleTokenBuilder } from "./builders/single-token";
import { Provider } from "@ethersproject/abstract-provider";
import { EIP712_TYPES, OfferTokenType } from "./types";
import * as Common from "../common";
import { BigNumberish } from "@ethersproject/bignumber";
import { BaseBuilder } from "./builders/base";

export class Order {
  public chainId: number;
  public params: Types.OrderParameters;
  public tradeAmount?: BigNumberish;

  constructor(chainId: number, params: Types.OrderParameters) {
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
    if (
      params.tokenType !== Types.OfferTokenType.ERC721 &&
      params.tokenType !== Types.OfferTokenType.ERC1155
    ) {
      throw new Error("Invalid token type");
    }
  }

  public exchange() {
    return new Exchange(this.chainId);
  }

  public hash() {
    return _TypedDataEncoder.hashStruct("Order", EIP712_TYPES, this.params);
  }

  public async sign(signer: TypedDataSigner) {
    // signing pure order
    const signature = await signer._signTypedData(
      this.exchange().eip712Domain(),
      EIP712_TYPES,
      this.getPureOrder()
    );

    this.params = {
      ...this.params,
      orderSignature: signature,
    };
  }

  public getSignatureData() {
    return {
      signatureKind: "eip712",
      domain: this.exchange().eip712Domain(),
      types: EIP712_TYPES,
      primaryType: _TypedDataEncoder.getPrimaryType(EIP712_TYPES),
      value: this.params,
    };
  }

  public getExchangeOrderParams(): Types.OrderParameters {
    for (const prop of ["kind", "currency"]) {
      if (Object.prototype.hasOwnProperty.call(this.params, prop)) {
        delete Object(this.params)[prop];
      }
    }
    return this.params;
  }

  public getPureOrder(): Types.PureOrder {
    return {
      offerer: this.params.offerer,
      offerItem: this.params.offerItem,
      royalty: this.params.royalty,
      salt: this.params.salt,
    };
  }

  private detectKind(): Types.OrderKind {
    // single-token
    {
      const builder = new SingleTokenBuilder(this.chainId);
      if (builder.isValid(this)) {
        return "single-token";
      }
    }

    throw new Error("Could not detect order kind (order might have unsupported params/calldata)");
  }

  public checkOrderSignature() {
    const signature = this.params.orderSignature!;

    const signer = verifyTypedData(
      this.exchange().eip712Domain(),
      EIP712_TYPES,
      this.getPureOrder(),
      signature
    );
    if (lc(this.params.offerer) !== lc(signer)) {
      throw new Error("Invalid signature (offerer is not signer)");
    }
  }

  public async checkFillability(provider: Provider) {
    const exchange: Exchange = this.exchange();
    const order_hash = this.hash();

    // check order status
    const fulfilledOrCancelled = await exchange.fulfilledOrCancelled(provider, order_hash);
    if (fulfilledOrCancelled) {
      throw new Error("Order already fulfilled or cancelled");
    }

    if (this.params.tokenType == OfferTokenType.ERC721) {
      const erc721 = new Common.Helpers.Erc721(provider, this.params.offerItem.offerToken);
      // Check ownership
      const owner = await erc721.getOwner(this.params.offerItem.offerTokenId);
      if (lc(owner) !== lc(this.params.offerer)) {
        throw new Error("erc721 no ownership");
      }
      // Check approval
      const isApproved = await erc721.isApproved(
        this.params.offerer,
        Addresses.Exchange[this.chainId]
      );
      if (!isApproved) {
        throw new Error("erc721 not approved");
      }
    } else if (this.params.tokenType == OfferTokenType.ERC1155) {
      const erc1155 = new Common.Helpers.Erc1155(provider, this.params.offerItem.offerToken);
      // Check balance
      const balance = await erc1155.getBalance(
        this.params.offerer,
        this.params.offerItem.offerTokenId
      );
      if (bn(balance).lt(this.params.offerItem.amount)) {
        // no partial fills
        throw new Error("erc1155 not enough balance");
      }

      // Check approval
      const isApproved = await erc1155.isApproved(
        this.params.offerer,
        Addresses.Exchange[this.chainId]
      );
      if (!isApproved) {
        throw new Error("erc1155 no approval");
      }
    } else {
      throw new Error("Invalid collection type");
    }
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  private getBuilder(): BaseBuilder {
    switch (this.params.kind) {
      case "single-token": {
        return new SingleTokenBuilder(this.chainId);
      }

      default: {
        throw new Error("Unknown order kind");
      }
    }
  }

  public async buildMatching(provider: Provider, receiver: string) {
    this.tradeAmount = await this.exchange().calculateTradeAmount(provider, this.params);
    const builder = new SingleTokenBuilder(this.chainId);
    return await builder.buildMatching(this, receiver);
  }
}

const normalize = (order: Types.OrderParameters): Types.OrderParameters => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    offerer: lc(order.offerer),
    currency: order.currency,
    receiver: order.receiver ? lc(order.receiver) : undefined,
    offerItem: {
      offerToken: lc(order.offerItem.offerToken),
      offerTokenId: s(order.offerItem.offerTokenId),
      offerAmount: s(order.offerItem.offerAmount),
      endTime: n(order.offerItem.endTime),
      amount: n(order.offerItem.amount),
    },
    royalty: {
      royaltyPercent: n(order.royalty.royaltyPercent),
      royaltyRecipient: lc(order.royalty.royaltyRecipient),
    },
    salt: n(order.salt),
    orderSignature: s(order.orderSignature),
    tokenType: n(order.tokenType),
  };
};
