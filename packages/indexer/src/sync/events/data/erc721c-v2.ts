import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const addedAccountToList: EventData = {
  kind: "erc721c-v2",
  subKind: "erc721c-v2-added-account-to-list",
  topic: "0xda8f3bd170446760f0f965a9b52bf271cb9679b5e0a70059eff2d49425229d17",
  numTopics: 4,
  abi: new Interface([
    `event AddedAccountToList(
      uint8 indexed kind,
      uint256 indexed id,
      address indexed account
    )`,
  ]),
};

export const addedCodeHashToList: EventData = {
  kind: "erc721c-v2",
  subKind: "erc721c-v2-added-code-hash-to-list",
  topic: "0xc8615322788d404dfe307db9eef031bc148d1cec5e270a1fd6528a02b445d445",
  numTopics: 4,
  abi: new Interface([
    `event AddedCodeHashToList(
      uint8 indexed kind,
      uint256 indexed id,
      bytes32 indexed codehash
    )`,
  ]),
};

export const removedAccountFromList: EventData = {
  kind: "erc721c-v2",
  subKind: "erc721c-v2-removed-account-from-list",
  topic: "0x503012490a650739416858609e898957b874d17415a062945179c57357978840",
  numTopics: 4,
  abi: new Interface([
    `event RemovedAccountFromList(
      uint8 indexed kind,
      uint256 indexed id,
      address indexed account
    )`,
  ]),
};

export const removedCodeHashFromList: EventData = {
  kind: "erc721c-v2",
  subKind: "erc721c-v2-removed-code-hash-from-list",
  topic: "0x061d78094976b1d9ae7bb858f141c915b46152756409caadb07482983c2ca301",
  numTopics: 4,
  abi: new Interface([
    `event RemovedCodeHashFromList(
      uint8 indexed kind,
      uint256 indexed id,
      bytes32 indexed codehash
    )`,
  ]),
};

export const appliedListToCollection: EventData = {
  kind: "erc721c-v2",
  subKind: "erc721c-v2-applied-list-to-collection",
  topic: "0xa66ff5557b7dc1562bb5e83306e15b513a25aa7537369bce38fc29c20847a791",
  numTopics: 3,
  abi: new Interface([
    `event AppliedListToCollection(
      address indexed collection,
      uint120 indexed id
    )`,
  ]),
};

export const transferValidatorUpdated: EventData = {
  kind: "erc721c-v2",
  subKind: "erc721c-v2-transfer-validator-updated",
  topic: "0xcc5dc080ff977b3c3a211fa63ab74f90f658f5ba9d3236e92c8f59570f442aac",
  numTopics: 1,
  abi: new Interface([
    `event TransferValidatorUpdated(
      address oldValidator,
      address newValidator
    )`,
  ]),
};

export const setTransferSecurityLevel: EventData = {
  kind: "erc721c-v2",
  subKind: "erc721c-v2-set-transfer-security-level",
  topic: "0xb39d8f1e6f05413a407e46fc950eb92e9f5b3d65a47c3f0bdc7a2741a6ec0f7d",
  numTopics: 2,
  abi: new Interface([
    `event SetTransferSecurityLevel(
      address indexed collection,
      uint8 level
    )`,
  ]),
};
