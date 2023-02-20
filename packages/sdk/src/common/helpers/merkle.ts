import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { keccak256 } from "@ethersproject/keccak256";
import MerkleTree from "merkletreejs";

export const hashFn = (tokenId: BigNumberish) =>
  keccak256(
    Buffer.from(
      BigNumber.from(tokenId).toHexString().slice(2).padStart(64, "0"),
      "hex"
    )
  );

export const generateMerkleTree = (tokenIds: BigNumberish[]) => {
  if (!tokenIds.length) {
    throw new Error("Could not generate merkle tree");
  }

  const leaves = tokenIds.map(hashFn);
  return new MerkleTree(leaves, keccak256, { sort: true });
};

export const generateMerkleProof = (
  merkleTree: MerkleTree,
  tokenId: BigNumberish
) => merkleTree.getHexProof(hashFn(tokenId));
