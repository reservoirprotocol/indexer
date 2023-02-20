import { Interface } from "@ethersproject/abi";
import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import { recoverAddress } from "@ethersproject/transactions";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder, BaseOrderInfo } from "./builders/base";
import * as Types from "./types";
import * as Common from "../common";
import { bn, getCurrentTimestamp, lc, n, s } from "../utils";

import ConduitControllerAbi from "./abis/ConduitController.json";
import ExchangeAbi from "./abis/Exchange.json";

export class Order {
  public chainId: number;
  public params: Types.OrderComponents;

  constructor(chainId: number, params: Types.OrderComponents) {
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

    // Fix signature
    this.fixSignature();
  }

  public hash() {
    return _TypedDataEncoder.hashStruct(
      "OrderComponents",
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

  public async checkSignature(provider?: Provider) {
    const signature = this.params.signature!;

    try {
      // Remove the `0x` prefix and count bytes not characters
      const actualSignatureLength = (signature.length - 2) / 2;

      // https://github.com/ProjectOpenSea/seaport/blob/4f2210b59aefa119769a154a12e55d9b77ca64eb/reference/lib/ReferenceVerifiers.sol#L126-L133
      const isBulkSignature =
        actualSignatureLength < 837 &&
        actualSignatureLength > 98 &&
        (actualSignatureLength - 67) % 32 < 2;
      if (isBulkSignature) {
        // https://github.com/ProjectOpenSea/seaport/blob/4f2210b59aefa119769a154a12e55d9b77ca64eb/reference/lib/ReferenceVerifiers.sol#L146-L220
        const proofAndSignature = this.params.signature!;

        const signatureLength = proofAndSignature.length % 2 === 0 ? 130 : 128;
        const signature = proofAndSignature.slice(0, signatureLength + 2);

        const key = bn(
          "0x" +
            proofAndSignature.slice(
              2 + signatureLength,
              2 + signatureLength + 6
            )
        ).toNumber();

        const height = Math.floor(
          (proofAndSignature.length - 2 - signatureLength) / 64
        );

        const proofElements: string[] = [];
        for (let i = 0; i < height; i++) {
          const start = 2 + signatureLength + 6 + i * 64;
          proofElements.push(
            "0x" + proofAndSignature.slice(start, start + 64).padEnd(64, "0")
          );
        }

        let root = this.hash();
        for (let i = 0; i < proofElements.length; i++) {
          if ((key >> i) % 2 === 0) {
            root = solidityKeccak256(
              ["bytes"],
              [root + proofElements[i].slice(2)]
            );
          } else {
            root = solidityKeccak256(
              ["bytes"],
              [proofElements[i] + root.slice(2)]
            );
          }
        }

        const types = { ...ORDER_EIP712_TYPES };
        (types as any).BulkOrder = [
          { name: "tree", type: `OrderComponents${`[2]`.repeat(height)}` },
        ];
        const encoder = _TypedDataEncoder.from(types);

        const bulkOrderTypeHash = solidityKeccak256(
          ["string"],
          [encoder.encodeType("BulkOrder")]
        );
        const bulkOrderHash = solidityKeccak256(
          ["bytes"],
          [bulkOrderTypeHash + root.slice(2)]
        );

        const value = solidityKeccak256(
          ["bytes"],
          [
            "0x1901" +
              _TypedDataEncoder
                .hashDomain(EIP712_DOMAIN(this.chainId))
                .slice(2) +
              bulkOrderHash.slice(2),
          ]
        );

        const signer = recoverAddress(value, signature);
        if (lc(this.params.offerer) !== lc(signer)) {
          throw new Error("Invalid signature");
        }
      } else {
        const signer = verifyTypedData(
          EIP712_DOMAIN(this.chainId),
          ORDER_EIP712_TYPES,
          this.params,
          signature
        );

        if (lc(this.params.offerer) !== lc(signer)) {
          throw new Error("Invalid signature");
        }
      }
    } catch {
      if (!provider) {
        throw new Error("Invalid signature");
      }

      const eip712Hash = _TypedDataEncoder.hash(
        EIP712_DOMAIN(this.chainId),
        ORDER_EIP712_TYPES,
        this.params
      );

      const iface = new Interface([
        "function isValidSignature(bytes32 digest, bytes signature) view returns (bytes4)",
      ]);

      const result = await new Contract(
        this.params.offerer,
        iface,
        provider
      ).isValidSignature(eip712Hash, signature);
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

    if (!this.getBuilder().isValid(this)) {
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

    if (!(info as any).isDynamic) {
      if (info.side === "buy") {
        return bn(info.price);
      } else {
        return bn(info.price).add(this.getFeeAmount());
      }
    } else {
      if (info.side === "buy") {
        // Reverse dutch-auctions are not supported
        return bn(info.price);
      } else {
        let price = bn(0);
        for (const c of this.params.consideration) {
          price = price.add(
            // startAmount - (currentTime - startTime) / (endTime - startTime) * (startAmount - endAmount)
            bn(c.startAmount).sub(
              bn(timestampOverride ?? getCurrentTimestamp(-60))
                .sub(this.params.startTime)
                .mul(bn(c.startAmount).sub(c.endAmount))
                .div(bn(this.params.endTime).sub(this.params.startTime))
            )
          );
          // Ensure we don't return any negative prices
          if (price.lt(c.endAmount)) {
            price = bn(c.endAmount);
          }
        }
        return price;
      }
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

  public buildMatching(data?: any) {
    return this.getBuilder().buildMatching(this, data);
  }

  public async checkFillability(provider: Provider) {
    const conduitController = new Contract(
      Addresses.ConduitController[this.chainId],
      ConduitControllerAbi as any,
      provider
    );
    const exchange = new Contract(
      Addresses.Exchange[this.chainId],
      ExchangeAbi as any,
      provider
    );

    const status = await exchange.getOrderStatus(this.hash());
    if (status.isCancelled) {
      throw new Error("not-fillable");
    }
    if (status.isValidated && bn(status.totalFilled).gte(status.totalSize)) {
      throw new Error("not-fillable");
    }

    const makerConduit =
      this.params.conduitKey === HashZero
        ? Addresses.Exchange[this.chainId]
        : await conduitController
            .getConduit(this.params.conduitKey)
            .then((result: { exists: boolean; conduit: string }) => {
              if (!result.exists) {
                throw new Error("invalid-conduit");
              } else {
                return result.conduit;
              }
            });

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
      const allowance = await erc20.getAllowance(
        this.params.offerer,
        makerConduit
      );
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
        const isApproved = await erc721.isApproved(
          this.params.offerer,
          makerConduit
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else {
        const erc1155 = new Common.Helpers.Erc1155(provider, info.contract);

        // Check balance
        const balance = await erc1155.getBalance(
          this.params.offerer,
          info.tokenId!
        );
        if (bn(balance).lt(info.amount)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc1155.isApproved(
          this.params.offerer,
          makerConduit
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      }
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

        this.params.signature =
          this.params.signature.slice(0, -2) + lastByte.toString(16);
      }
    }
  }
}

export const EIP712_DOMAIN = (chainId: number) => ({
  name: "Seaport",
  version: "1.2",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

export const ORDER_EIP712_TYPES = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
};

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
  };
};
