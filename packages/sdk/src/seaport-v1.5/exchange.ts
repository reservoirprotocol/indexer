import { defaultAbiCoder } from "@ethersproject/abi";
import { TypedDataSigner } from "@ethersproject/abstract-signer";
import { hexConcat } from "@ethersproject/bytes";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { _TypedDataEncoder } from "@ethersproject/hash";
import { keccak256 } from "@ethersproject/keccak256";
import axios from "axios";
import { MerkleTree } from "merkletreejs";

import * as Addresses from "./addresses";
import * as BaseAddresses from "../seaport-base/addresses";
import { ORDER_EIP712_TYPES, IOrder } from "../seaport-base/order";
import * as Types from "../seaport-base/types";
import { bn } from "../utils";

import ExchangeAbi from "./abis/Exchange.json";
import { SeaportBaseExchange } from "../seaport-base/exchange";

export class Exchange extends SeaportBaseExchange {
  protected exchangeAddress: string;
  protected cancellationZoneAddress: string;
  public contract: Contract;

  constructor(chainId: number) {
    super(chainId);
    this.exchangeAddress = Addresses.Exchange[chainId];
    this.cancellationZoneAddress = BaseAddresses.ReservoirCancellationZone[chainId];
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
    if (order.params.zone === this.cancellationZoneAddress) {
      return true;
    }
    return false;
  }

  // matchParams should always pass for seaport-v1.4
  public async getExtraData(order: IOrder, matchParams?: Types.MatchParams): Promise<string> {
    switch (order.params.zone) {
      case this.cancellationZoneAddress: {
        return axios
          .post(
            `https://seaport-oracle-${
              this.chainId === 1
                ? "mainnet"
                : this.chainId === 5
                ? "goerli"
                : this.chainId === 137
                ? "polygon"
                : "mumbai"
            }.up.railway.app/api/signatures`,
            {
              orders: [
                {
                  chainId: this.chainId,
                  orderParameters: order.params,
                  fulfiller: AddressZero,
                  marketplaceContract: this.contract.address,
                  substandardRequests: [
                    {
                      requestedReceivedItems: order.params.consideration.map((c) => ({
                        ...c,
                        // All criteria items should have been resolved
                        itemType: c.itemType > 3 ? c.itemType - 2 : c.itemType,
                        // Adjust the amount to the quantity filled (won't work for dutch auctions)
                        amount: bn(matchParams!.amount ?? 1)
                          .mul(c.endAmount)
                          .div(order.getInfo()!.amount)
                          .toString(),
                        identifier:
                          c.itemType > 3
                            ? matchParams!.criteriaResolvers![0].identifier
                            : c.identifierOrCriteria,
                      })),
                    },
                  ],
                },
              ],
            }
          )
          .then((response) => response.data.orders[0].extraDataComponent);
      }

      default:
        return "0x";
    }
  }
}
