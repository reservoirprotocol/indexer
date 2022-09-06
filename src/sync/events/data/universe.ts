import { Interface } from "@ethersproject/abi";
import { Universe } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const match: EventData = {
  kind: "universe-match",
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
