import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Addresses from "./addresses";
import * as Types from "./types";
import { lc, n, s } from "../utils";

export class Order {
  public chainId: number;
  public params: Types.Request;

  constructor(chainId: number, params: Types.Request) {
    this.chainId = chainId;

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
      domain: EIP712_DOMAIN(this.chainId),
      types: EIP712_TYPES,
      value: this.params,
      primaryType: _TypedDataEncoder.getPrimaryType(EIP712_TYPES),
    };
  }

  public checkSignature() {
    const signer = verifyTypedData(
      EIP712_DOMAIN(this.chainId),
      EIP712_TYPES,
      this.params,
      this.params.signature!
    );

    if (lc(this.params.maker) !== lc(signer)) {
      throw new Error("Invalid signature");
    }
  }
}

const EIP712_DOMAIN = (chainId: number) => ({
  name: "CrossChainEscrow",
  version: "1",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

const EIP712_TYPES = {
  Request: [
    { name: "isCollectionRequest", type: "bool" },
    { name: "maker", type: "address" },
    { name: "solver", type: "address" },
    { name: "token", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "salt", type: "uint256" },
  ],
};

const normalize = (order: Types.Request): Types.Request => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    isCollectionRequest: order.isCollectionRequest,
    maker: lc(order.maker),
    solver: lc(order.solver),
    token: lc(order.token),
    tokenId: s(order.tokenId),
    amount: s(order.amount),
    price: s(order.price),
    recipient: lc(order.recipient),
    chainId: n(order.chainId),
    deadline: n(order.deadline),
    salt: s(order.salt),
    signature: order.signature ? lc(order.signature) : undefined,
  };
};
