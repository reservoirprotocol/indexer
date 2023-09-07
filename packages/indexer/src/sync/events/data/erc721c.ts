import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const verifiedEOASignature: EventData = {
  kind: "erc721c",
  subKind: "erc721c-verified-eoa-signature",
  topic: "0xe7f8d62df5af850daa5d677e9e5c8065b7b549ec99ae61ba0ffaa9f5bf3e2d03",
  numTopics: 2,
  abi: new Interface([`event VerifiedEOASignature(address indexed account)`]),
};

export const addedToAllowlist: EventData = {
  kind: "erc721c",
  subKind: "erc721c-added-to-allowlist",
  topic: "0x611e962a89a9663f9e201204430468ed34f23cd95c1be59b66fa79cefa726b4f",
  numTopics: 4,
  abi: new Interface([
    `event AddedToAllowlist(
      uint8 indexed kind,
      uint256 indexed id,
      address indexed account
    )`,
  ]),
};

export const removedFromAllowlist: EventData = {
  kind: "erc721c",
  subKind: "erc721c-removed-from-allowlist",
  topic: "0x5d23e0e2d8347166058712ba9dceec21d6edd7b466a0d13cb759d730bd560390",
  numTopics: 4,
  abi: new Interface([
    `event RemovedFromAllowlist(
      uint8 indexed kind,
      uint256 indexed id,
      address indexed account
    )`,
  ]),
};

export const setAllowlist: EventData = {
  kind: "erc721c",
  subKind: "erc721c-set-allowlist",
  topic: "0x6e5a76d990dc6af893e20eb82ea37eac6f22cc50e7c7306275569cdc5421a543",
  numTopics: 4,
  abi: new Interface([
    `event SetAllowlist(
      uint8 indexed kind,
      address indexed collection,
      uint120 indexed id
    )`,
  ]),
};

export const transferValidatorUpdated: EventData = {
  kind: "erc721c",
  subKind: "erc721c-transfer-validator-updated",
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
  kind: "erc721c",
  subKind: "erc721c-set-transfer-security-level",
  topic: "0xb39d8f1e6f05413a407e46fc950eb92e9f5b3d65a47c3f0bdc7a2741a6ec0f7d",
  numTopics: 2,
  abi: new Interface([
    `event SetTransferSecurityLevel(
      address indexed collection,
      uint8 level
    )`,
  ]),
};
