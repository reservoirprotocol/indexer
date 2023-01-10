import { Interface } from "@ethersproject/abi";
import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";
import { Infinity } from "@reservoir0x/sdk";

export const matchOrderFulfilled: EventData = {
  kind: "infinity-match-order-fulfilled",
  addresses: { [Infinity.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x9f0ef199f3d5fa3ecdee559103421e5ce53b68b3187e374801d79307d145d1eb",
  numTopics: 4,
  abi: new Interface([
    `event MatchOrderFulfilled(
      bytes32 sellOrderHash,
      bytes32 buyOrderHash,
      address indexed seller,
      address indexed buyer,
      address complication,
      address indexed currency,
      uint256 amount,
      (address collection, (uint256 tokenId, uint256 numTokens)[] tokens)[] nfts 
    )`,
  ]),
};

export const takeOrderFulfilled: EventData = {
  kind: "infinity-take-order-fulfilled",
  addresses: { [Infinity.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xd1b78f78360698bdfc69fb877fd0dd84d4817dfe3095a8456e6f7ff0f4d51170",
  numTopics: 4,
  abi: new Interface([
    `event TakeOrderFulfilled(
        bytes32 orderHash,
        address indexed seller,
        address indexed buyer,
        address complication, 
        address indexed currency, 
        uint256 amount, 
        (address collection, (uint256 tokenId, uint256 numTokens)[] tokens )[] nfts 
      )`,
  ]),
};

export const cancelAllOrders: EventData = {
  kind: "infinity-cancel-all-orders",
  addresses: { [Infinity.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x1e7178d84f0b0825c65795cd62e7972809ad3aac6917843aaec596161b2c0a97",
  numTopics: 2,
  abi: new Interface([`event CancelAllOrders(address indexed user, uint256 newMinNonce)`]),
};

export const cancelMultipleOrders: EventData = {
  kind: "infinity-cancel-multiple-orders",
  addresses: { [Infinity.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xfa0ae5d80fe3763c880a3839fab0294171a6f730d1f82c4cd5392c6f67b41732",
  numTopics: 2,
  abi: new Interface([`event CancelMultipleOrders(address indexed user, uint256[] orderNonces)`]),
};
