import { Interface } from "@ethersproject/abi";
import { BendDao } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const takerAsk: EventData = {
  kind: "bend-dao-taker-ask",
  addresses: { [BendDao.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x68cd251d4d267c6e2034ff0088b990352b97b2002c0476587d0c4da889c11330",
  numTopics: 4,
  abi: new Interface([
    `event TakerAsk(
      bytes32 orderHash,
      uint256 orderNonce,
      address indexed taker,
      address indexed maker,
      address indexed strategy,
      address currency,
      address collection,
      uint256 tokenId,
      uint256 amount,
      uint256 price
    )`,
  ]),
};

export const takerBid: EventData = {
  kind: "bend-dao-taker-bid",
  addresses: { [BendDao.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x95fb6205e23ff6bda16a2d1dba56b9ad7c783f67c96fa149785052f47696f2be",
  numTopics: 4,
  abi: new Interface([
    `event TakerBid(
      bytes32 orderHash,
      uint256 orderNonce,
      address indexed taker,
      address indexed maker,
      address indexed strategy,
      address currency,
      address collection,
      uint256 tokenId,
      uint256 amount,
      uint256 price
    )`,
  ]),
};
