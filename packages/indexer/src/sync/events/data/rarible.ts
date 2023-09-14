import { Interface } from "@ethersproject/abi";
import { Rarible } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const match: EventData = {
  kind: "rarible",
  subKind: "rarible-match",
  addresses: { [Rarible.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x956cd63ee4cdcd81fda5f0ec7c6c36dceda99e1b412f4a650a5d26055dc3c450",
  numTopics: 1,
  abi: new Interface([
    `event Match(
      bytes32 leftHash,
      bytes32 rightHash,
      uint newLeftFill,
      uint newRightFill)
    `,
  ]),
};

export const cancel: EventData = {
  kind: "rarible",
  subKind: "rarible-cancel",
  addresses: { [Rarible.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xe8d9861dbc9c663ed3accd261bbe2fe01e0d3d9e5f51fa38523b265c7757a93a",
  numTopics: 1,
  abi: new Interface([`event Cancel(bytes32 hash)`]),
};

export const matchV2: EventData = {
  kind: "rarible",
  subKind: "rarible-match-v2",
  addresses: { [Rarible.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x268820db288a211986b26a8fda86b1e0046281b21206936bb0e61c67b5c79ef4",
  numTopics: 1,
  abi: new Interface([
    `event Match(
      bytes32 leftHash,
      bytes32 rightHash,
      address leftMaker,
      address rightMaker,
      uint256 newLeftFill,
      uint256 newRightFill,
      (bytes4 assetClass, bytes data) leftAsset,
      (bytes4 assetClass, bytes data) rightAsset
    )`,
  ]),
};

export const buyV1: EventData = {
  kind: "rarible",
  subKind: "rarible-buy-v1",
  addresses: { [Rarible.Addresses.ExchangeV1[config.chainId]?.toLowerCase()]: true },
  topic: "0xdddcdb07e460849cf04a4445b7af9faf01b7f5c7ba75deaf969ac5ed830312c3",
  numTopics: 3,
  abi: new Interface([
    `event Buy(
      address indexed sellToken,
      uint256 indexed sellTokenId,
      uint256 sellValue,
      address owner,
      address buyToken,
      uint256 buyTokenId,
      uint256 buyValue,
      address buyer,
      uint256 amount,
      uint256 salt
    )`,
  ]),
};
