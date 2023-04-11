/* eslint-disable @typescript-eslint/no-explicit-any */

import { BytesLike } from "@ethersproject/bytes";
import { _TypedDataEncoder as TypedDataEncoder } from "@ethersproject/hash";
import { keccak256 } from "@ethersproject/keccak256";
import { MerkleTree } from "merkletreejs";

import { EIP712TypedData } from "../types";

type BatchOrderElements<T> = [T, T] | [BatchOrderElements<T>, BatchOrderElements<T>];

const hexToBuffer = (value: string) => Buffer.from(value.slice(2), "hex");

const chunk = <T>(array: T[], size: number): T[][] =>
  Array(Math.ceil(array.length / size))
    .fill(0)
    .map((_, i) => array.slice(i * size, (i + 1) * size));

const fillArray = <T>(arr: T[], length: number, value: T): T[] => {
  const arrCopy = [...arr];
  if (length > arr.length) {
    arrCopy.push(...Array(length - arr.length).fill(value));
  }
  return arrCopy;
};

export class Eip712MerkleTree<BaseType extends Record<string, any> = any> {
  public tree: MerkleTree;
  private completeLeaves: string[];
  private completeElements: BaseType[];

  static getTreeHeight = (length: number): number => Math.max(Math.ceil(Math.log2(length)), 1);

  constructor(
    public types: EIP712TypedData,
    public leafType: string,
    defaultNode: BaseType,
    public elements: BaseType[],
    public depth: number
  ) {
    const encoder = TypedDataEncoder.from(types);
    const leafHasher = (leaf: BaseType) => encoder.hashStruct(leafType, leaf);

    const leaves = this.elements.map(leafHasher);
    const defaultLeaf = leafHasher(defaultNode);

    this.completeLeaves = fillArray(leaves, this.completedSize, defaultLeaf);
    this.completeElements = fillArray(elements, this.completedSize, defaultNode);

    this.tree = new MerkleTree(
      this.completeLeaves.map(hexToBuffer),
      (value: BytesLike) => hexToBuffer(keccak256(value)),
      {
        sort: false,
        hashLeaves: false,
        fillDefaultHash: hexToBuffer(defaultLeaf),
      }
    );
  }

  get completedSize() {
    return Math.pow(2, this.depth);
  }

  get hexRoot() {
    return this.tree.getHexRoot();
  }

  public getPositionalProof(i: number) {
    const leaf = this.completeLeaves[i];
    const proof = this.tree.getPositionalHexProof(leaf, i);
    return { leaf, proof };
  }

  public getDataToSign(): { tree: BatchOrderElements<BaseType> } {
    let layer = this.completeElements as any;
    while (layer.length > 2) {
      layer = chunk(layer, 2);
    }
    return { tree: layer };
  }
}
