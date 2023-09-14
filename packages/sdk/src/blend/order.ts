import * as Types from "./types";
import { lc, s, n } from "../utils";
import { defaultAbiCoder } from "@ethersproject/abi";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";
import { Provider } from "@ethersproject/abstract-provider";
import { Contract } from "@ethersproject/contracts";
import { AddressZero } from "@ethersproject/constants";
import ExchangeAbi from "./abis/Blend.json";
import * as Addresses from "./addresses";

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
  }

  public hash() {
    const [types, value, structName] = this.getEip712TypesAndValue();
    return _TypedDataEncoder.hashStruct(structName, types, value);
  }

  public getSignatureData() {
    const [types, value] = this.getEip712TypesAndValue();
    return {
      signatureKind: "eip712",
      domain: EIP712_DOMAIN(this.chainId),
      types,
      value,
      primaryType: _TypedDataEncoder.getPrimaryType(types),
    };
  }

  public checkSignature() {
    const [types, value] = this.getEip712TypesAndValue();

    if (!this.params.signature) {
      throw new Error("signature empty");
    }

    const signature = this.params.signature;
    const orderSignature = signature.slice(2, 132);
    const oracleSignature = signature.slice(132, 262);
    const blockNumber = defaultAbiCoder.decode(
      ["uint256"],
      `0x${signature.slice(262, signature.length)}`
    )[0];

    const orderHash = this.hash();
    const signer = verifyTypedData(
      EIP712_DOMAIN(this.chainId),
      types,
      value,
      `0x${orderSignature}`
    );
    if (lc(this.params.borrower) !== lc(signer)) {
      throw new Error("Invalid signature");
    }

    if (this.params.oracle != AddressZero) {
      const oracleSigner = verifyTypedData(
        EIP712_DOMAIN(this.chainId),
        EIP712_ORACLE_OFFER_TYPES,
        {
          hash: orderHash,
          blockNumber,
        },
        `0x${oracleSignature}`
      );

      if (lc(this.params.oracle) !== lc(oracleSigner)) {
        throw new Error("Invalid oracle signature");
      }
    }
  }

  public async checkFillability(provider: Provider) {
    const exchange = new Contract(Addresses.Blend[this.chainId], ExchangeAbi, provider);
    const amountTaken = await exchange.amountTaken(this.hash());
    if (amountTaken.gt(0)) {
      throw new Error("not-fillable");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getEip712TypesAndValue(): any {
    // bulk-sign
    return [EIP712_SELL_OFFER_TYPES, this.params, "SellOffer"];
  }
}

export const EIP712_SELL_OFFER_TYPES = {
  SellOffer: [
    { name: "borrower", type: "address" },
    { name: "lienId", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "expirationTime", type: "uint256" },
    { name: "salt", type: "uint256" },
    { name: "oracle", type: "address" },
    { name: "fees", type: "Fee[]" },
    { name: "nonce", type: "uint256" },
  ],
  Fee: [
    { name: "rate", type: "uint16" },
    { name: "recipient", type: "address" },
  ],
};

export const EIP712_LOAN_OFFER_TYPES = {
  LoanOffer: [
    { name: "lender", type: "address" },
    { name: "collection", type: "address" },
    { name: "totalAmount", type: "uint256" },
    { name: "minAmount", type: "uint256" },
    { name: "maxAmount", type: "uint256" },
    { name: "auctionDuration", type: "uint256" },
    { name: "salt", type: "uint256" },
    { name: "expirationTime", type: "uint256" },
    { name: "rate", type: "uint256" },
    { name: "oracle", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
};

export const EIP712_ORACLE_OFFER_TYPES = {
  OracleOffer: [
    { name: "hash", type: "bytes32" },
    { name: "blockNumber", type: "uint256" },
  ],
};

export const EIP712_DOMAIN = (chainId: number) => ({
  name: "Blend",
  version: "1.0",
  chainId,
  verifyingContract: Addresses.Blend[chainId],
});

const normalize = (order: Types.OrderParams): Types.OrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    borrower: lc(order.borrower),
    oracle: lc(order.oracle),
    nonce: s(order.nonce),
    price: s(order.price),
    fees: order.fees.map(({ recipient, rate }) => ({
      recipient: lc(recipient),
      rate: n(rate),
    })),
    salt: s(order.salt),
    lienId: s(order.lienId),
    expirationTime: n(order.expirationTime),
    signature: order.signature ? lc(order.signature) : undefined,
  };
};
