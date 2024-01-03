import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";
import { Hotpot } from "@reservoir0x/sdk";
import { Interface } from "@ethersproject/abi";

export const orderFulfilled: EventData = {
  kind: "hotpot",
  subKind: "hotpot-order-filled",
  addresses: { [Hotpot.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x1bbc142e8dd96aee2d7b1e4ceab7afdb9ccd9774e0bfc9215a26cf51f651f018",
  numTopics: 3,
  abi: new Interface([
    `event OrderFulfilled(
      address indexed offerer,
      address indexed receiver,
      address offerToken,
      uint256 tokenId,
      uint256 tokenAmount,
      uint256 tradeAmount,
      bytes32 orderHash
    )`,
  ]),
};

export const orderCancelled: EventData = {
  kind: "hotpot",
  subKind: "hotpot-order-cancelled",
  addresses: { [Hotpot.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x151f2e6a40b8eb99b522d83ee781be0fda3a72f094311e92c5108e7ea7f83ec3",
  numTopics: 2,
  abi: new Interface([
    `event OrderCancelled(
      address indexed offerer,
      address offerToken,
      uint256 tokenId,
      bytes32 orderHash
    )`,
  ]),
};
