import { Interface } from "@ethersproject/abi";
import { Blur } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const ordersMatched: EventData = {
  kind: "blur-orders-matched",
  addresses: { [Blur.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x61cbb2a3dee0b6064c2e681aadd61677fb4ef319f0b547508d495626f5a62f64",
  numTopics: 3,
  abi: new Interface([
    `event OrdersMatched(
      address indexed maker,
      address indexed taker,
      (
        address trader,
        uint8 side,
        address matchingPolicy,
        address collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 price,
        uint256 listingTime,
        uint256 expirationTime,
        (
          uint16 rate,
          address recipient
        )[] fees,
        uint256 salt,
        bytes extraParams
      ) sell,
      bytes32 sellHash,
      (
        address trader,
        uint8 side,
        address matchingPolicy,
        address collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 price,
        uint256 listingTime,
        uint256 expirationTime,
        (
          uint16 rate,
          address recipient
        )[] fees,
        uint256 salt,
        bytes extraParams
      ) buy,
      bytes32 buyHash
    )`,
  ]),
};

export const orderCancelled: EventData = {
  kind: "blur-order-cancelled",
  addresses: { [Blur.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x5152abf959f6564662358c2e52b702259b78bac5ee7842a0f01937e670efcc7d",
  numTopics: 1,
  abi: new Interface([`event OrderCancelled(bytes32 hash)`]),
};

export const nonceIncremented: EventData = {
  kind: "blur-nonce-incremented",
  addresses: { [Blur.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xa82a649bbd060c9099cd7b7326e2b0dc9e9af0836480e0f849dc9eaa79710b3b",
  numTopics: 2,
  abi: new Interface([`event NonceIncremented(address indexed trader, uint256 newNonce)`]),
};
