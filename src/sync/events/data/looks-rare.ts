import { Interface } from "@ethersproject/abi";
import { LooksRare } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const cancelAllOrders: EventData = {
  kind: "looks-rare",
  subKind: "looks-rare-cancel-all-orders",
  addresses: { [LooksRare.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x1e7178d84f0b0825c65795cd62e7972809ad3aac6917843aaec596161b2c0a97",
  numTopics: 2,
  abi: new Interface([
    `event CancelAllOrders(
      address indexed user,
      uint256 newMinNonce
    )`,
  ]),
};

export const cancelMultipleOrders: EventData = {
  kind: "looks-rare",
  subKind: "looks-rare-cancel-multiple-orders",
  addresses: { [LooksRare.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xfa0ae5d80fe3763c880a3839fab0294171a6f730d1f82c4cd5392c6f67b41732",
  numTopics: 2,
  abi: new Interface([
    `event CancelMultipleOrders(
      address indexed user,
      uint256[] orderNonces
    )`,
  ]),
};

export const takerAsk: EventData = {
  kind: "looks-rare",
  subKind: "looks-rare-taker-ask",
  addresses: { [LooksRare.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
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
  kind: "looks-rare",
  subKind: "looks-rare-taker-bid",
  addresses: { [LooksRare.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
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
