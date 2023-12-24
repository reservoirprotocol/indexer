import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const rangeEditionMintCreated: EventData = {
  kind: "soundxyz",
  subKind: "soundxyz-range-edition-mint-created",
  topic: "0x9a9e0edce33a498fe7d57bfc9e7b46f9a2cd45507d8853c0c18c4c7bd860798c",
  numTopics: 2,
  abi: new Interface([
    `event RangeEditionMintCreated(
      address indexed edition,
      uint128 mintId,
      uint96 price,
      uint32 startTime,
      uint32 cutoffTime,
      uint32 endTime,
      uint16 affiliateFeeBPS,
      uint32 maxMintableLower,
      uint32 maxMintableUpper,
      uint32 maxMintablePerAccount
    )`,
  ]),
};

export const merkleDropMintCreated: EventData = {
  kind: "soundxyz",
  subKind: "soundxyz-merkle-drop-mint-created",
  topic: "0xd9faafd9b789bcd20399f1fafa1c6459996ac840e9177ee687c23cdbe3b7a9cb",
  numTopics: 2,
  abi: new Interface([
    `event MerkleDropMintCreated(
      address indexed edition,
      uint128 mintId,
      bytes32 merkleRootHash,
      uint96 price,
      uint32 startTime,
      uint32 endTime,
      uint16 affiliateFeeBPS,
      uint32 maxMintable,
      uint32 maxMintablePerAccount
    )`,
  ]),
};
