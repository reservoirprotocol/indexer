import { Interface } from "@ethersproject/abi";
import { Treasure } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const itemSold: EventData = {
  kind: "treasure",
  subKind: "treasure-item-sold",
  addresses: { [Treasure.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x72d3f914473a393354e6fcd9c3cb7d2eee53924b9b856f9da274e024566292a5",
  numTopics: 1,
  abi: new Interface([
    `event ItemSold(
      address seller, 
      address buyer, 
      address nftAddress, 
      uint256 tokenId, 
      uint64 quantity, 
      uint128 pricePerItem, 
      address paymentToken
    )`,
  ]),
};
