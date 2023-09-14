import { Interface } from "@ethersproject/abi";
import { SeaportV14 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const orderCancelled: EventData = {
  kind: "seaport",
  subKind: "seaport-v1.4-order-cancelled",
  addresses: { [SeaportV14.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x6bacc01dbe442496068f7d234edd811f1a5f833243e0aec824f86ab861f3c90d",
  numTopics: 3,
  abi: new Interface([
    `event OrderCancelled(
      bytes32 orderHash,
      address indexed offerer,
      address indexed zone
    )`,
  ]),
};

export const orderFulfilled: EventData = {
  kind: "seaport",
  subKind: "seaport-v1.4-order-filled",
  addresses: { [SeaportV14.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x9d9af8e38d66c62e2c12f0225249fd9d721c54b83f48d9352c97c6cacdcb6f31",
  numTopics: 3,
  abi: new Interface([
    `event OrderFulfilled(
      bytes32 orderHash,
      address indexed offerer,
      address indexed zone,
      address recipient,
      (
        uint8 itemType,
        address token,
        uint256 identifier,
        uint256 amount
      )[] offer,
      (
        uint8 itemType,
        address token,
        uint256 identifier,
        uint256 amount,
        address recipient
      )[] consideration
    )`,
  ]),
};

export const ordersMatched: EventData = {
  kind: "seaport",
  subKind: "seaport-v1.4-orders-matched",
  addresses: { [SeaportV14.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x4b9f2d36e1b4c93de62cc077b00b1a91d84b6c31b4a14e012718dcca230689e7",
  numTopics: 1,
  abi: new Interface([`event OrdersMatched(bytes32[] orderHashes)`]),
};

export const counterIncremented: EventData = {
  kind: "seaport",
  subKind: "seaport-v1.4-counter-incremented",
  addresses: { [SeaportV14.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x721c20121297512b72821b97f5326877ea8ecf4bb9948fea5bfcb6453074d37f",
  numTopics: 2,
  abi: new Interface([
    `event CounterIncremented(
      uint256 newCounter,
      address indexed offerer
    )`,
  ]),
};

export const orderValidated: EventData = {
  kind: "seaport",
  subKind: "seaport-v1.4-order-validated",
  addresses: { [SeaportV14.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xf280791efe782edcf06ce15c8f4dff17601db3b88eb3805a0db7d77faf757f04",
  numTopics: 1,
  abi: new Interface([
    `event OrderValidated(
      bytes32 orderHash,
      (
        address offerer,
        address zone,
        (
          uint8 itemType,
          address token,
          uint256 identifierOrCriteria,
          uint256 startAmount,
          uint256 endAmount
        )[] offer,
        (
          uint8 itemType,
          address token,
          uint256 identifierOrCriteria,
          uint256 startAmount,
          uint256 endAmount,
          address recipient
        )[] consideration,
        uint8 orderType,
        uint256 startTime,
        uint256 endTime,
        bytes32 zoneHash,
        uint256 salt,
        bytes32 conduitKey,
        uint256 totalOriginalConsiderationItems
      ) orderParameters
    )`,
  ]),
};
