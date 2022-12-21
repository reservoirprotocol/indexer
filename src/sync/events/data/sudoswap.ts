import { Interface } from "@ethersproject/abi";
import { Sudoswap } from "@reservoir0x/sdk";

import { config } from "@/config/index";
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

export const tokenDeposit: EventData = {
  kind: "sudoswap-token-deposit",
  topic: "0xf1b3be8dace0fecfbdb6fb0fa1cc014c612bcb1b46db027c1ece5fc11fff09d6",
  numTopics: 1,
  abi: new Interface([`event TokenDeposit(uint256 amount)`]),
};

export const tokenWithdrawal: EventData = {
  kind: "sudoswap-token-withdrawal",
  topic: "0x0e266e8f38544aa1480d73762386eb10df55b1b8453d935762e891c44b69a1e6",
  numTopics: 1,
  abi: new Interface([`event TokenWithdrawal(uint256 amount)`]),
};

export const spotPriceUpdate: EventData = {
  kind: "sudoswap-spot-price-update",
  topic: "0xf06180fdbe95e5193df4dcd1352726b1f04cb58599ce58552cc952447af2ffbb",
  numTopics: 1,
  abi: new Interface([`event SpotPriceUpdate(uint128 newSpotPrice)`]),
};

export const deltaUpdate: EventData = {
  kind: "sudoswap-delta-update",
  topic: "0xc958ae052d28f8d17bc2c4ddbabb699a3cab5cccefd034d0fc971efdadc01da5",
  numTopics: 1,
  abi: new Interface([`event DeltaUpdate(uint128 newDelta)`]),
};

export const newPair: EventData = {
  kind: "sudoswap-new-pair",
  addresses: { [Sudoswap.Addresses.PairFactory[config.chainId]?.toLowerCase()]: true },
  topic: "0xf5bdc103c3e68a20d5f97d2d46792d3fdddfa4efeb6761f8141e6a7b936ca66c",
  numTopics: 1,
  abi: new Interface([`event NewPair(address pool)`]),
};
