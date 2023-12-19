import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Types from "./types";
import { lc, n, s } from "../../../utils";

export class Order {
  public params: Types.Request;

  constructor(params: Types.Request) {
    try {
      this.params = normalize(params);
    } catch {
      throw new Error("Invalid params");
    }
  }

  public hash() {
    return _TypedDataEncoder.hashStruct("Request", EIP712_TYPES, this.params);
  }

  public getSignatureData() {
    return {
      signatureKind: "eip712",
      domain: EIP712_DOMAIN(),
      types: EIP712_TYPES,
      value: this.params,
      primaryType: _TypedDataEncoder.getPrimaryType(EIP712_TYPES),
    };
  }

  public checkSignature() {
    const signer = verifyTypedData(
      EIP712_DOMAIN(),
      EIP712_TYPES,
      this.params,
      this.params.signature!
    );

    if (lc(this.params.maker) !== lc(signer)) {
      throw new Error("Invalid signature");
    }
  }
}

const EIP712_DOMAIN = () => ({
  name: "SingleInputModule",
});

const EIP712_TYPES = {
  Request: [
    { name: "maker", type: "address" },
    { name: "solver", type: "address" },
    { name: "currency", type: "address" },
    { name: "price", type: "uint256" },
    { name: "originChainId", type: "uint32" },
    { name: "destinationChainId", type: "uint32" },
    { name: "deadline", type: "uint32" },
    { name: "salt", type: "uint32" },
    { name: "zoneAndValueAndData", type: "bytes" },
  ],
};

const normalize = (order: Types.Request): Types.Request => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    maker: lc(order.maker),
    solver: lc(order.solver),
    currency: lc(order.currency),
    price: s(order.price),
    originChainId: n(order.originChainId),
    destinationChainId: n(order.destinationChainId),
    deadline: n(order.deadline),
    salt: n(order.salt),
    zoneAndValueAndData: lc(order.zoneAndValueAndData),
    signature: order.signature ? lc(order.signature) : undefined,
  };
};
