import { Interface } from "@ethersproject/abi";
import { EventData } from "@/events-sync/data";
import { CryptoKitties } from "@reservoir0x/sdk";
import { config } from "@/config/index";

export const transfer: EventData = {
  kind: "cryptokitties-transfer",
  addresses: { [CryptoKitties.Addresses.Core[config.chainId]?.toLowerCase()]: true },
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  numTopics: 1,
  abi: new Interface([
    `event Transfer(
      address from,
      address to,
      uint256 tokenId
    )`,
  ]),
};
