import { _TypedDataEncoder } from "@ethersproject/hash";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { Types } from ".";
//import * as Addresses from "./addresses";
import { lc, n, s } from "../utils";
import { Exchange } from "./exchange";
import { verifyTypedData } from "@ethersproject/wallet";

export class Order {
  public chainId: number;
  public params: Types.OrderParameters;

  constructor(chainId: number, params: Types.OrderParameters) {
    this.chainId = chainId;

    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }

    // Detect kind
    /* if (!params.kind) {
      this.params.kind = this.detectKind();
    } */

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
      this.params
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

  public getPureOrder(): Types.PureOrder {
    return {
      offerer: this.params.offerer,
      offerItem: this.params.offerItem,
      royalty: this.params.royalty,
      salt: this.params.salt,
    };
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
}

const EIP712_TYPES = {
  OfferItem: [
    { name: "offerToken", type: "address" },
    { name: "offerTokenId", type: "uint256" },
    { name: "offerAmount", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "amount", type: "uint256" },
  ],
  RoyaltyData: [
    { name: "royaltyPercent", type: "uint256" },
    { name: "royaltyRecipient", type: "address" },
  ],
  PendingAmountData: [
    { name: "offererPendingAmount", type: "uint256" },
    { name: "buyerPendingAmount", type: "uint256" },
    { name: "orderHash", type: "bytes32" },
  ],
  Order: [
    { name: "offerer", type: "address" },
    { name: "offerItem", type: "OfferItem" },
    { name: "royalty", type: "RoyaltyData" },
    { name: "salt", type: "uint256" },
  ],
};

const normalize = (order: Types.OrderParameters): Types.OrderParameters => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    offerer: lc(order.offerer),
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
    pendingAmountsData: {
      offererPendingAmount: order.pendingAmountsData
        ? s(order.pendingAmountsData.offererPendingAmount)
        : undefined,
      buyerPendingAmount: order.pendingAmountsData
        ? s(order.pendingAmountsData.buyerPendingAmount)
        : undefined,
      orderHash: order.pendingAmountsData ? s(order.pendingAmountsData.orderHash) : undefined,
    },
    salt: n(order.salt),
    orderSignature: s(order.orderSignature),
    pendingAmountsSignature: s(order.pendingAmountsSignature),
    tokenType: n(order.tokenType),
  };
};
