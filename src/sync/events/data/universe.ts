import { Interface } from "@ethersproject/abi";
import { Universe } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const match: EventData = {
  kind: "universe",
  subKind: "universe-match",
  addresses: { [Universe.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x268820db288a211986b26a8fda86b1e0046281b21206936bb0e61c67b5c79ef4",
  numTopics: 4,
  abi: new Interface([
    `event Match(
      bytes32 indexed leftHash,
      bytes32 indexed rightHash,
      address indexed leftMaker,
      address rightMaker,
      uint256 newLeftFill,
      uint256 newRightFill,
      (bytes4 assetClass, bytes data) leftAsset,
      (bytes4 assetClass, bytes data) rightAsset
    )`,
  ]),
};

export const cancel: EventData = {
  kind: "universe",
  subKind: "universe-cancel",
  addresses: { [Universe.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xbbdc98cb2835f4f846e6a63700d0498b4674f0e8858fd50c6379314227afa04e",
  numTopics: 3,
  abi: new Interface([
    `event Cancel(
      bytes32 indexed hash,
      address indexed maker,
      (bytes4 assetClass, bytes data) makeAssetType,
      (bytes4 assetClass, bytes data) takeAssetType
    )`,
  ]),
};
