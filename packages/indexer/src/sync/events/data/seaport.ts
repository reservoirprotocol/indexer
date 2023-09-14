import { Interface } from "@ethersproject/abi";
import { SeaportV11 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const orderCancelled: EventData = {
  kind: "seaport",
  subKind: "seaport-order-cancelled",
  addresses: { [SeaportV11.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
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
  subKind: "seaport-order-filled",
  addresses: { [SeaportV11.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
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

export const counterIncremented: EventData = {
  kind: "seaport",
  subKind: "seaport-counter-incremented",
  addresses: { [SeaportV11.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
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
  subKind: "seaport-order-validated",
  addresses: { [SeaportV11.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xfde361574a066b44b3b5fe98a87108b7565e327327954c4faeea56a4e6491a0a",
  numTopics: 3,
  abi: new Interface([
    `event OrderValidated(
      bytes32 orderHash,
      address indexed offerer,
      address indexed zone
    )`,
  ]),
};

export const channelUpdated: EventData = {
  kind: "seaport",
  subKind: "seaport-channel-updated",
  topic: "0xae63067d43ac07563b7eb8db6595635fc77f1578a2a5ea06ba91b63e2afa37e2",
  numTopics: 2,
  abi: new Interface([`event ChannelUpdated(address indexed channel, bool open)`]),
};
