import { Interface } from "@ethersproject/abi";
import { WyvernV2 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const ordersMatched: EventData = {
  kind: "wyvern",
  subKind: "wyvern-v2-orders-matched",
  addresses: { [WyvernV2.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xc4109843e0b7d514e4c093114b863f8e7d8d9a458c372cd51bfe526b588006c9",
  numTopics: 4,
  abi: new Interface([
    `event OrdersMatched(
      bytes32 buyHash,
      bytes32 sellHash,
      address indexed maker,
      address indexed taker,
      uint256 price,
      bytes32 indexed metadata
    )`,
  ]),
};
