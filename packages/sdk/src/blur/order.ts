import { Provider } from "@ethersproject/abstract-provider";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { splitSignature, Signature } from "@ethersproject/bytes";
import { HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { verifyTypedData } from "@ethersproject/wallet";

import * as Addresses from "./addresses";
import { Builders } from "./builders";
import { BaseBuilder, BaseOrderInfo } from "./builders/base";
import * as Types from "./types";
import * as Common from "../common";
import { bn, lc, n, s, BytesEmpty } from "../utils";
import ExchangeAbi from "./abis/Exchange.json";
import { MerkleTree } from "merkletreejs";
import { keccak256, defaultAbiCoder } from "ethers/lib/utils";

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
    return {
      order: this.params,
      v: this.params.v,
      r: this.params.r ?? "",
      s: this.params.s ?? "",
      extraSignature: this.params.extraSignature ?? BytesEmpty,
      signatureVersion: this.params.signatureVersion ?? 0,
      blockNumber: this.params.blockNumber ?? 0,
    };
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
      signatureVersion: 0,
      v,
      r,
      s,
    };
  }

  static async doOracleSign(order: Order, oracle: TypedDataSigner) {
    const { types, value } = Order.getEip712TypesAndValueForOracle(order);
    return splitSignature(
      await oracle._signTypedData(EIP712_DOMAIN(order.chainId), types, value)
    );
  }

  static getEip712TypesAndValueForOracle(order: Order) {
    return {
      types: ORACLE_ORDER_EIP712_TYPES,
      value: {
        order: toRawOrder(order),
        blockNumber: order.params.blockNumber,
      },
    };
  }

  public async oracleSign(oracle: TypedDataSigner) {
    const signature = await Order.doOracleSign(this, oracle);
    this.params = {
      ...this.params,
      extraSignature: packSignature(signature),
      extraParams: "0x01",
    };
  }

  static async signBulk(orders: Order[], signer: TypedDataSigner) {
    const { tree, root } = await getOrderTreeRoot(orders);
    const firstOrder = orders[0];
    const { v, r, s } = splitSignature(
      await signer._signTypedData(
        EIP712_DOMAIN(firstOrder.chainId),
        ORDER_ROOT_EIP712_TYPES,
        {
          root: root,
        }
      )
    );

    // sign each order
    for (let index = 0; index < orders.length; index++) {
      const order = orders[index];
      const orderHash = order.hash();
      const extraSignature = defaultAbiCoder.encode(
        ["bytes32[]"],
        [tree.getHexProof(orderHash)]
      );
      order.params.extraSignature = extraSignature;
      // bulk
      order.params.signatureVersion = 1;
      order.params.r = r;
      order.params.v = v;
      order.params.s = s;
    }
  }

  static async signBulkOracle(orders: Order[], oracle: TypedDataSigner) {
    for (let index = 0; index < orders.length; index++) {
      const order = orders[index];
      const oracleSig = await Order.doOracleSign(order, oracle);
      const extraSignature = defaultAbiCoder.encode(
        ["bytes32[]", "uint8", "bytes32", "bytes32"],
        [
          defaultAbiCoder.decode(["bytes32[]"], order.params.extraSignature)[0],
          oracleSig.v,
          oracleSig.r,
          oracleSig.s,
        ]
      );
      order.params.extraSignature = extraSignature;
    }
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

  public isOracleSign() {
    return this.params.extraParams.startsWith("0x01");
  }

  public checkSignature() {
    const [types, value] = this.getEip712TypesAndValue();
    const isOracleSign = this.isOracleSign();
    let signer: string | null;
    const signature = {
      v: this.params.v,
      r: this.params.r ?? "",
      s: this.params.s ?? "",
    };

    // bulk sign
    if (this.params.signatureVersion === 1) {
      const proof = defaultAbiCoder.decode(
        ["bytes32[]"],
        this.params.extraSignature
      )[0];
      const tree = new MerkleTree([], keccak256, {
        sort: true,
      });
      const treeRoot = computedRoot(tree, proof, this.hash());
      signer = verifyTypedData(
        EIP712_DOMAIN(this.chainId),
        ORDER_ROOT_EIP712_TYPES,
        {
          root: treeRoot,
        },
        signature
      );
    } else {
      signer = verifyTypedData(
        EIP712_DOMAIN(this.chainId),
        types,
        value,
        signature
      );
    }

    if (lc(this.params.trader) !== lc(signer)) {
      throw new Error("Invalid signature");
    }

    if (isOracleSign) {
      // bulk sign
      const { types, value } = Order.getEip712TypesAndValueForOracle(this);
      if (this.params.signatureVersion === 1) {
        const [merklePath, _v, _r, _s] = defaultAbiCoder.decode(
          ["bytes32[]", "uint8", "bytes32", "bytes32"],
          this.params.extraSignature
        );
        signer = verifyTypedData(EIP712_DOMAIN(this.chainId), types, value, {
          v: _v,
          r: _r,
          s: _s,
        });
      } else {
        const { types, value } = Order.getEip712TypesAndValueForOracle(this);
        const [_v, _r, _s] = defaultAbiCoder.decode(
          ["uint8", "bytes32", "bytes32"],
          this.params.extraSignature
        );
        signer = verifyTypedData(EIP712_DOMAIN(this.chainId), types, value, {
          v: _v,
          r: _r,
          s: _s,
        });
      }

      if (Addresses.Oracle[this.chainId] !== lc(signer)) {
        throw new Error("Invalid oracle signature");
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

    const exchange = new Contract(
      Addresses.Exchange[this.chainId],
      ExchangeAbi as any,
      provider
    );

    let status: boolean = await exchange.cancelledOrFilled(this.hash());
    if (status) {
      throw new Error("not-fillable");
    }

    // Determine the order's fees (which are to be payed by the buyer)
    // let feeAmount = this.getFeeAmount();

    if (this.params.side === Types.TradeDirection.BUY) {
      // Check that maker has enough balance to cover the payment
      // and the approval to the token transfer proxy is set
      const erc20 = new Common.Helpers.Erc20(
        provider,
        this.params.paymentToken
      );
      const balance = await erc20.getBalance(this.params.trader);
      if (bn(balance).lt(bn(this.params.price))) {
        throw new Error("no-balance");
      }

      // Check allowance
      const allowance = await erc20.getAllowance(
        this.params.trader,
        Addresses.ExecutionDelegate[chainId]
      );
      if (bn(allowance).lt(bn(this.params.paymentToken))) {
        throw new Error("no-approval");
      }
    } else {
      if (this.params.kind?.startsWith("erc721")) {
        const erc721 = new Common.Helpers.Erc721(
          provider,
          this.params.collection
        );

        // Check ownership
        const owner = await erc721.getOwner(this.params.tokenId);
        if (lc(owner) !== lc(this.params.trader)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc721.isApproved(
          this.params.trader,
          Addresses.ExecutionDelegate[this.chainId]
        );
        if (!isApproved) {
          throw new Error("no-approval");
        }
      } else {
        const erc1155 = new Common.Helpers.Erc1155(
          provider,
          this.params.collection
        );

        // Check balance
        const balance = await erc1155.getBalance(
          this.params.trader,
          this.params.tokenId
        );

        if (bn(balance).lt(this.params.amount!)) {
          throw new Error("no-balance");
        }

        // Check approval
        const isApproved = await erc1155.isApproved(
          this.params.trader,
          Addresses.ExecutionDelegate[this.chainId]
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

  private getEip712TypesAndValue() {
    // bulk-sign
    return [ORDER_EIP712_TYPES, toRawOrder(this), "Order"];
  }

  private getBuilder(): BaseBuilder {
    return new Builders.SingleToken(this.chainId);
  }

  private detectKind(): Types.OrderKind {
    if (
      this.params.matchingPolicy ===
      Addresses.StandardPolicyERC721[this.chainId]
    ) {
      return "erc721-single-token";
    }

    if (
      this.params.matchingPolicy ===
      Addresses.StandardPolicyERC721_V2[this.chainId]
    ) {
      return "erc721-single-token";
    }

    throw new Error(
      "Could not detect order kind (order might have unsupported params/calldata)"
    );
  }
}

const EIP712_DOMAIN = (chainId: number) => ({
  name: "Blur Exchange",
  version: "1.0",
  chainId,
  verifyingContract: Addresses.Exchange[chainId],
});

const ORDER_EIP712_TYPES = {
  Order: [
    { name: "trader", type: "address" },
    { name: "side", type: "uint8" },
    { name: "matchingPolicy", type: "address" },
    { name: "collection", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "paymentToken", type: "address" },
    { name: "price", type: "uint256" },
    { name: "listingTime", type: "uint256" },
    { name: "expirationTime", type: "uint256" },
    { name: "fees", type: "Fee[]" },
    { name: "salt", type: "uint256" },
    { name: "extraParams", type: "bytes" },
    { name: "nonce", type: "uint256" },
  ],
  Fee: [
    { name: "rate", type: "uint16" },
    { name: "recipient", type: "address" },
  ],
};

const ORACLE_ORDER_EIP712_TYPES = {
  OracleOrder: [
    { name: "order", type: "Order" },
    { name: "blockNumber", type: "uint256" },
  ],
  Order: [
    { name: "trader", type: "address" },
    { name: "side", type: "uint8" },
    { name: "matchingPolicy", type: "address" },
    { name: "collection", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "paymentToken", type: "address" },
    { name: "price", type: "uint256" },
    { name: "listingTime", type: "uint256" },
    { name: "expirationTime", type: "uint256" },
    { name: "fees", type: "Fee[]" },
    { name: "salt", type: "uint256" },
    { name: "extraParams", type: "bytes" },
    { name: "nonce", type: "uint256" },
  ],
  Fee: [
    { name: "rate", type: "uint16" },
    { name: "recipient", type: "address" },
  ],
};

const ORDER_ROOT_EIP712_TYPES = {
  Root: [{ name: "root", type: "bytes32" }],
};

const toRawOrder = (order: Order): any => ({
  ...order.params,
});

function getMerkleProof(leaves: string[]) {
  const tree = new MerkleTree(leaves, keccak256, { sort: true });
  const root = tree.getHexRoot();
  return { root, tree };
}

function packSignature(signature: Signature): string {
  return defaultAbiCoder.encode(
    ["uint8", "bytes32", "bytes32"],
    [signature.v, signature.r, signature.s]
  );
}

async function getOrderTreeRoot(orders: Order[]) {
  const leaves = await Promise.all(
    orders.map(async (order) => {
      return order.hash();
    })
  );
  return getMerkleProof(leaves);
}

function computedRoot(tree: MerkleTree, proof: string[], targetNode: string) {
  const hashFn = tree.bufferifyFn(keccak256);
  let hash = tree.bufferify(targetNode);
  for (let i = 0; i < proof.length; i++) {
    const node = proof[i];
    let data = null;
    let isLeftNode = null;
    if (typeof node === "string") {
      data = tree.bufferify(node);
      isLeftNode = true;
    } else {
      throw new Error("Expected node to be of type string or object");
    }
    const buffers = [];
    if (Buffer.compare(hash, data) === -1) {
      buffers.push(hash, data);
      hash = hashFn(Buffer.concat(buffers));
    } else {
      buffers.push(data, hash);
      hash = hashFn(Buffer.concat(buffers));
    }
  }
  return tree.bufferToHex(hash);
}

const normalize = (order: Types.BaseOrder): Types.BaseOrder => {
  // Perform some normalization operations on the order:
  // - convert bignumbers to strings where needed
  // - convert strings to numbers where needed
  // - lowercase all strings

  return {
    kind: order.kind,
    side: order.side,
    trader: lc(order.trader),
    matchingPolicy: lc(order.matchingPolicy),
    collection: lc(order.collection),
    tokenId: s(order.tokenId),
    nonce: s(order.nonce),
    amount: s(order.amount),
    paymentToken: lc(order.paymentToken),
    price: s(order.price),
    listingTime: s(order.listingTime),
    fees: order.fees.map(({ recipient, rate }) => ({
      recipient: lc(recipient),
      rate: n(rate),
    })),
    expirationTime: s(order.expirationTime),
    extraParams: order.extraParams,
    salt: s(order.salt),
    signatureVersion: order.signatureVersion ?? 1,
    extraSignature: order.extraSignature ?? BytesEmpty,
    blockNumber: order.blockNumber ?? 0,
    v: order.v ?? 0,
    r: order.r ?? HashZero,
    s: order.s ?? HashZero,
  };
};
