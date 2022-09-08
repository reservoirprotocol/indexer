import { Interface } from "@ethersproject/abi";
import { CryptoPunks } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const punkOffered: EventData = {
  kind: "cryptopunks-punk-offered",
  addresses: { [CryptoPunks.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x3c7b682d5da98001a9b8cbda6c647d2c63d698a4184fd1d55e2ce7b66f5d21eb",
  numTopics: 3,
  abi: new Interface([
    `event PunkOffered(
      uint256 indexed punkIndex,
      uint256 minValue,
      address indexed toAddress
    )`,
  ]),
};

export const punkNoLongerForSale: EventData = {
  kind: "cryptopunks-punk-no-longer-for-sale",
  addresses: { [CryptoPunks.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xb0e0a660b4e50f26f0b7ce75c24655fc76cc66e3334a54ff410277229fa10bd4",
  numTopics: 2,
  abi: new Interface([`event PunkNoLongerForSale(uint256 indexed punkIndex)`]),
};

export const punkBought: EventData = {
  kind: "cryptopunks-punk-bought",
  addresses: { [CryptoPunks.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x58e5d5a525e3b40bc15abaa38b5882678db1ee68befd2f60bafe3a7fd06db9e3",
  numTopics: 4,
  abi: new Interface([
    `event PunkBought(
      uint256 indexed punkIndex,
      uint256 value,
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
    )`,
  ]),
};
