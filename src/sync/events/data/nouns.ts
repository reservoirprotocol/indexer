import { Interface } from "@ethersproject/abi";
import { Nouns } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const auctionSettled: EventData = {
  kind: "nouns",
  subKind: "nouns-auction-settled",
  addresses: { [Nouns.Addresses.AuctionHouse[config.chainId]?.toLowerCase()]: true },
  topic: "0xc9f72b276a388619c6d185d146697036241880c36654b1a3ffdad07c24038d99",
  numTopics: 2,
  abi: new Interface([
    `event AuctionSettled(
      uint256 indexed nounId,
      address winner,
      uint256 amount
    )`,
  ]),
};
