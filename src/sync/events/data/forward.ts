import { Interface } from "@ethersproject/abi";
import { Forward } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const orderFilled: EventData = {
  kind: "forward",
  subKind: "forward-order-filled",
  addresses: { [Forward.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x93a10e2a77b61344921f8b6c0860010fc8f365f97a0f7bc5d077a0941522b562",
  numTopics: 1,
  abi: new Interface([
    `event OrderFilled(
      bytes32 orderHash,
      address maker,
      address taker,
      address token,
      uint256 identifier,
      uint128 filledAmount,
      uint256 unitPrice
    )`,
  ]),
};

export const orderCancelled: EventData = {
  kind: "forward",
  subKind: "forward-order-cancelled",
  addresses: { [Forward.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x5152abf959f6564662358c2e52b702259b78bac5ee7842a0f01937e670efcc7d",
  numTopics: 1,
  abi: new Interface([
    `event OrderCancelled(
      bytes32 orderHash
    )`,
  ]),
};

export const counterIncremented: EventData = {
  kind: "forward",
  subKind: "forward-counter-incremented",
  addresses: { [Forward.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x59950fb23669ee30425f6d79758e75fae698a6c88b2982f2980638d8bcd9397d",
  numTopics: 1,
  abi: new Interface([
    `event CounterIncremented(
      address maker,
      uint256 newCounter
    )`,
  ]),
};
