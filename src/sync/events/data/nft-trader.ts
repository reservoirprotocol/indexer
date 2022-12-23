import { Interface } from "@ethersproject/abi";
import { NftTrader } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const swap: EventData = {
  kind: "nft-trader-swap",
  addresses: { [NftTrader.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x8873f53f40d4865bac9c1e8998aef3351bb1ef3db1a6923ab09621cf1a6659a9",
  numTopics: 4,
  abi: new Interface([
    `event swapEvent(
      address indexed creator, 
      uint256 indexed time, 
      uint8 indexed status, 
      uint256 swapId, 
      address counterpart, 
      address referral
      )`,
  ]),
};
