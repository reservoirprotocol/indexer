import { Provider } from "@ethersproject/abstract-provider";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import { recoverAddress } from "@ethersproject/transactions";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { Eip712MakerMerkleTree } from "./utils/Eip712MakerMerkleTree";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder } from "./builders/base";
import * as Types from "./types";
import * as Common from "../common";
import { bn, lc, n, s } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";

const MAGIC_VALUE_ORDER_NONCE_EXECUTED =
  "0x53849a1acec87308423850dccd979fc7a4b74b75a79b19c3b98ec8df38a599db";

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
    return _TypedDataEncoder.hashStruct("Maker", EIP712_TYPES, this.params);
  }

  public async sign(signer: TypedDataSigner) {
    const signature = await signer._signTypedData(
      EIP712_DOMAIN(this.chainId),
      EIP712_TYPES,
      this.params
    );
    this.params = {
      ...this.params,
      signature: signature,
    };
  }

  static async signBulkOrders(signer: TypedDataSigner, orders: Order[]) {
    const tree = new Eip712MakerMerkleTree(orders.map((_) => _.params));
    const chainId = orders[0].chainId;
    const domain = EIP712_DOMAIN(chainId);
    const hexRoot = tree.hexRoot;
    const signature = await signer._signTypedData(domain, tree.types, tree.getDataToSign());

    const merkleTreeProofs: Types.MerkleTree[] = orders.map((_, index) => {
      const { proof } = tree.getPositionalProof(index);
      return {
        root: hexRoot,
        proof: proof.map((node) => {
          return {
            position: node[0] as number,
            value: node[1] as string,
          };
        }),
      };
    });

    for (let index = 0; index < orders.length; index++) {
      const order = orders[index];
      order.params.merkleTree = merkleTreeProofs[index];
      order.params.signature = signature;
    }
  }

  public getSignatureData() {
    return {
      signatureKind: "eip712",
      domain: EIP712_DOMAIN(this.chainId),
      types: EIP712_TYPES,
      primaryType: _TypedDataEncoder.getPrimaryType(EIP712_TYPES),
      value: toRawOrder(this),
    };
  }

  public checkSignature() {
    const signature = this.params.signature!;

    if (this.params.merkleTree) {
      const merkleTree = this.params.merkleTree;

      const height = merkleTree.proof.length;

      let computedHash = this.hash();
      for (let i = 0; i < height; i++) {
        if (merkleTree.proof[i].position === Types.MerkleTreeNodePosition.Left) {
          computedHash = solidityKeccak256(
            ["bytes"],
            [merkleTree.proof[i].value + computedHash.slice(2)]
          );
        } else {
          computedHash = solidityKeccak256(
            ["bytes"],
            [computedHash + merkleTree.proof[i].value.slice(2)]
          );
        }
      }

      if (computedHash !== merkleTree.root) {
        throw new Error("Invalid merkle proof");
      }

      const types = { ...EIP712_TYPES };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (types as any).BatchOrder = [{ name: "tree", type: `Maker${`[2]`.repeat(height)}` }];
      const encoder = _TypedDataEncoder.from(types);

      const bulkOrderTypeHash = solidityKeccak256(["string"], [encoder.encodeType("BatchOrder")]);
      const bulkOrderHash = solidityKeccak256(
        ["bytes"],
        [bulkOrderTypeHash + merkleTree.root.slice(2)]
      );

      const value = solidityKeccak256(
        ["bytes"],
        [
          "0x1901" +
            _TypedDataEncoder.hashDomain(EIP712_DOMAIN(this.chainId)).slice(2) +
            bulkOrderHash.slice(2),
        ]
      );

      const signer = recoverAddress(value, signature);
      if (lc(this.params.signer) !== lc(signer)) {
        throw new Error("Invalid signature");
      }
    } else {
      const signer = verifyTypedData(
        EIP712_DOMAIN(this.chainId),
        EIP712_TYPES,
        toRawOrder(this),
        signature
      );
      if (lc(this.params.signer) !== lc(signer)) {
        throw new Error("Invalid signature");
      }
    }
  }

  public checkValidity() {
    if (!this.getBuilder().isValid(this)) {
      throw new Error("Invalid order");
    }
  }

  public async checkFillability(provider: Provider) {
    const chainId = await provider.getNetwork().then((n) => n.chainId);
    const exchange = new Contract(Addresses.Exchange[this.chainId], ExchangeAbi, provider);

    const executedOrCancelled = await exchange.userOrderNonce(
      this.params.signer,
      this.params.orderNonce
    );

    if (executedOrCancelled === MAGIC_VALUE_ORDER_NONCE_EXECUTED) {
      throw new Error("executed-or-cancelled");
    }

    const nonces = await exchange.userBidAskNonces(this.params.signer);
    const userCurrentNonce =
      this.params.quoteType === Types.QuoteType.Ask ? nonces.askNonce : nonces.bidNonce;

    if (userCurrentNonce.gt(this.params.orderNonce)) {
      throw new Error("cancelled");
    }

    if (this.params.quoteType === Types.QuoteType.Ask) {
      if (this.params.collectionType === Types.CollectionType.ERC721) {
        const erc721 = new Common.Helpers.Erc721(provider, this.params.collection);
        // Check ownership
        const owner = await erc721.getOwner(this.params.itemIds[0]);
        if (lc(owner) !== lc(this.params.signer)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc721.isApproved(
          this.params.signer,
          Addresses.TransferManager[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else if (this.params.collectionType === Types.CollectionType.ERC1155) {
        const erc1155 = new Common.Helpers.Erc1155(provider, this.params.collection);
        // Check balance
        const balance = await erc1155.getBalance(this.params.signer, this.params.itemIds[0]);
        if (bn(balance).lt(1)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc1155.isApproved(
          this.params.signer,
          Addresses.TransferManager[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else {
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
      const allowance = await erc20.getAllowance(this.params.signer, Addresses.Exchange[chainId]);
      if (bn(allowance).lt(this.params.price)) {
        throw new Error("no-approval");
      }
    }
  }

  public buildMatching(taker: string, data?: object) {
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

    throw new Error("Could not detect order kind (order might have unsupported params/calldata)");
  }
}

const EIP712_DOMAIN = (chainId: number) => ({
  name: "LooksRareProtocol",
  version: "2",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

const EIP712_TYPES = {
  Maker: [
    { name: "quoteType", type: "uint8" },
    { name: "globalNonce", type: "uint256" },
    { name: "subsetNonce", type: "uint256" },
    { name: "orderNonce", type: "uint256" },
    { name: "strategyId", type: "uint256" },
    { name: "collectionType", type: "uint8" },
    { name: "collection", type: "address" },
    { name: "currency", type: "address" },
    { name: "signer", type: "address" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "price", type: "uint256" },
    { name: "itemIds", type: "uint256[]" },
    { name: "amounts", type: "uint256[]" },
    { name: "additionalParameters", type: "bytes" },
  ],
};

export const getBatchOrderTypes = (height: number) => {
  return {
    BatchOrder: [{ name: "tree", type: `Maker${`[2]`.repeat(height)}` }],
    Maker: EIP712_TYPES.Maker,
  };
};

const toRawOrder = (order: Order): object => ({
  ...order.params,
});

const normalize = (order: Types.MakerOrderParams): Types.MakerOrderParams => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    kind: order.kind,
    globalNonce: s(order.globalNonce),
    subsetNonce: s(order.subsetNonce),
    orderNonce: s(order.orderNonce),
    strategyId: n(order.strategyId),
    collectionType: order.collectionType,
    quoteType: order.quoteType,
    collection: lc(order.collection),
    currency: lc(order.currency),
    signer: lc(order.signer),
    price: s(order.price),
    itemIds: order.itemIds.map((c) => s(c)),
    amounts: order.amounts.map((c) => s(c)),
    additionalParameters: lc(order.additionalParameters),
    startTime: n(order.startTime),
    endTime: n(order.endTime),
    signature: order.signature ?? HashZero,
    merkleTree: order.merkleTree,
  };
};
