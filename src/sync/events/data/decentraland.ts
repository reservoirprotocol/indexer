import { Interface } from "@ethersproject/abi";
import { Decentraland } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const sale: EventData = {
  kind: "decentraland-sale",
  addresses: { [Decentraland.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x695ec315e8a642a74d450a4505eeea53df699b47a7378c7d752e97d5b16eb9bb",
  numTopics: 4,
  abi: new Interface([
    `event OrderSuccessful(
      bytes32 id,
      uint256 indexed assetId,
      address indexed seller,
      address nftAddress,
      uint256 totalPrice,
      address indexed buyer
    )`,
  ]),
};
