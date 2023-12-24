import { defaultAbiCoder } from "@ethersproject/abi";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { hexConcat } from "@ethersproject/bytes";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { keccak256 } from "@ethersproject/keccak256";
import { MerkleTree } from "merkletreejs";

import * as Addresses from "./addresses";
import * as BaseAddresses from "../seaport-base/addresses";
import { ORDER_EIP712_TYPES, IOrder } from "../seaport-base/order";
import * as Types from "../seaport-base/types";

import ExchangeAbi from "./abis/Exchange.json";
import { SeaportBaseExchange } from "../seaport-base/exchange";

export class Exchange extends SeaportBaseExchange {
  protected exchangeAddress: string;
  public contract: Contract;

  constructor(chainId: number) {
    super(chainId);
    this.exchangeAddress = Addresses.Exchange[chainId];
    this.contract = new Contract(this.exchangeAddress, ExchangeAbi);
  }

  public eip712Domain(): {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  } {
    return {
      name: "Seaport",
      version: "1.5",
      chainId: this.chainId,
      verifyingContract: this.exchangeAddress,
    };
  }

  // --- Derive conduit from key ---

  public deriveConduit(conduitKey: string) {
    return conduitKey === HashZero
      ? this.exchangeAddress
      : this.conduitController.deriveConduit(conduitKey);
  }

  // --- Bulk sign orders ---

  public getBulkSignatureDataWithProofs(orders: IOrder[]) {
    const height = Math.max(Math.ceil(Math.log2(orders.length)), 1);
    const size = Math.pow(2, height);

    const types = { ...ORDER_EIP712_TYPES };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (types as any).BulkOrder = [{ name: "tree", type: `OrderComponents${`[2]`.repeat(height)}` }];
    const encoder = _TypedDataEncoder.from(types);

    const hashElement = (element: Types.OrderComponents) =>
      encoder.hashStruct("OrderComponents", element);

    const elements = orders.map((o) => o.params);
    const leaves = elements.map((e) => hashElement(e));

    const defaultElement: Types.OrderComponents = {
      offerer: AddressZero,
      zone: AddressZero,
      offer: [],
      consideration: [],
      orderType: 0,
      startTime: 0,
      endTime: 0,
      zoneHash: HashZero,
      salt: "0",
      conduitKey: HashZero,
      counter: "0",
    };
    const defaultLeaf = hashElement(defaultElement);

    // Ensure the tree is complete
    while (elements.length < size) {
      elements.push(defaultElement);
      leaves.push(defaultLeaf);
    }

    const hexToBuffer = (value: string) => Buffer.from(value.slice(2), "hex");
    const bufferKeccak = (value: string) => hexToBuffer(keccak256(value));

    const tree = new MerkleTree(leaves.map(hexToBuffer), bufferKeccak, {
      complete: true,
      sort: false,
      hashLeaves: false,
      fillDefaultHash: hexToBuffer(defaultLeaf),
    });

    let chunks: object[] = [...elements];
    while (chunks.length > 2) {
      const newSize = Math.ceil(chunks.length / 2);
      chunks = Array(newSize)
        .fill(0)
        .map((_, i) => chunks.slice(i * 2, (i + 1) * 2));
    }

    return {
      signatureData: {
        signatureKind: "eip712",
        domain: this.eip712Domain(),
        types,
        value: { tree: chunks },
        primaryType: _TypedDataEncoder.getPrimaryType(types),
      },
      proofs: orders.map((_, i) => tree.getHexProof(leaves[i], i)),
    };
  }

  public async bulkSign(signer: TypedDataSigner, orders: IOrder[]) {
    const { signatureData, proofs } = this.getBulkSignatureDataWithProofs(orders);

    const signature = await signer._signTypedData(
      signatureData.domain,
      signatureData.types,
      signatureData.value
    );

    orders.forEach((order, i) => {
      order.params.signature = this.encodeBulkOrderProofAndSignature(i, proofs[i], signature);
    });
  }

  public encodeBulkOrderProofAndSignature = (
    orderIndex: number,
    merkleProof: string[],
    signature: string
  ) => {
    return hexConcat([
      signature,
      `0x${orderIndex.toString(16).padStart(6, "0")}`,
      defaultAbiCoder.encode([`uint256[${merkleProof.length}]`], [merkleProof]),
    ]);
  };

  // --- Get extra data ---

  public requiresExtraData(order: IOrder): boolean {
    if (order.params.extraData) {
      return true;
    }

    if (order.params.zone === BaseAddresses.ReservoirCancellationZone[this.chainId]) {
      return true;
    }

    return false;
  }

  public async getExtraData(order: IOrder, matchParams?: Types.MatchParams): Promise<string> {
    if (
      order.params.extraData ||
      order.params.zone === BaseAddresses.ReservoirCancellationZone[this.chainId]
    ) {
      return order.params.extraData ?? "0x";
    }

    return matchParams?.extraData ?? "0x";
  }
}
