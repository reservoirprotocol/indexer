import { Interface } from "@ethersproject/abi";
import { TofuNft } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const inventoryUpdate: EventData = {
  kind: "tofu-inventory-update",
  addresses: { [TofuNft.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x5beea7b3b87c573953fec05007114d17712e5775d364acc106d8da9e74849033",
  numTopics: 2,
  abi: new Interface([
    `event EvInventoryUpdate(
      uint256 indexed id,
      (
        address seller,
        address buyer,
        address currency,
        uint256 price,
        uint256 netPrice,
        uint256 deadline,
        uint8 kind,
        uint8 status
      ) inventory
    )`,
  ]),
};
