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
