import { Interface } from "@ethersproject/abi";
import { CryptoPunks } from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const punkBought: EventData = {
  kind: "cryptopunks-punk-bought",
  addresses: { [CryptoPunks.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x58e5d5a525e3b40bc15abaa38b5882678db1ee68befd2f60bafe3a7fd06db9e3",
  numTopics: 4,
  abi: new Interface([
    `event PunkBought(
      uint indexed punkIndex,
      uint value,
      address indexed fromAddress,
      address indexed toAddress
      )`,
  ]),
};

export const transfer: EventData = {
  kind: "cryptopunks-transfer",
  addresses: { [CryptoPunks.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  numTopics: 3,
  abi: new Interface([
    `event Transfer(
      address indexed from,
      address indexed to,
      uint256 value
      );`,
  ]),
};
