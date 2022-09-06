import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";

export const sell: EventData = {
  kind: "sudoswap-sell",
  topic: "0x3614eb567740a0ee3897c0e2b11ad6a5720d2e4438f9c8accf6c95c24af3a470",
  numTopics: 1,
  abi: new Interface([`event SwapNFTInPair()`]),
};

export const buy: EventData = {
  kind: "sudoswap-buy",
  topic: "0xbc479dfc6cb9c1a9d880f987ee4b30fa43dd7f06aec121db685b67d587c93c93",
  numTopics: 1,
  abi: new Interface([`event SwapNFTOuPair()`]),
};
