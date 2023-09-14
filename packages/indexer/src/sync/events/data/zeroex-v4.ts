import { Interface } from "@ethersproject/abi";
import { ZeroExV4 } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const erc721OrderCancelled: EventData = {
  kind: "zeroex-v4",
  subKind: "zeroex-v4-erc721-order-cancelled",
  addresses: { [ZeroExV4.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xa015ad2dc32f266993958a0fd9884c746b971b254206f3478bc43e2f125c7b9e",
  numTopics: 1,
  abi: new Interface([
    `event ERC721OrderCancelled(
      address maker,
      uint256 nonce
    )`,
  ]),
};

export const erc1155OrderCancelled: EventData = {
  kind: "zeroex-v4",
  subKind: "zeroex-v4-erc1155-order-cancelled",
  addresses: { [ZeroExV4.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x4d5ea7da64f50a4a329921b8d2cab52dff4ebcc58b61d10ff839e28e91445684",
  numTopics: 1,
  abi: new Interface([
    `event ERC1155OrderCancelled(
      address maker,
      uint256 nonce
    )`,
  ]),
};

export const erc721OrderFilled: EventData = {
  kind: "zeroex-v4",
  subKind: "zeroex-v4-erc721-order-filled",
  addresses: { [ZeroExV4.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x50273fa02273cceea9cf085b42de5c8af60624140168bd71357db833535877af",
  numTopics: 1,
  abi: new Interface([
    `event ERC721OrderFilled(
      uint8 direction,
      address maker,
      address taker,
      uint256 nonce,
      address erc20Token,
      uint256 erc20TokenAmount,
      address erc721Token,
      uint256 erc721TokenId,
      address matcher
    )`,
  ]),
};

export const erc1155OrderFilled: EventData = {
  kind: "zeroex-v4",
  subKind: "zeroex-v4-erc1155-order-filled",
  addresses: { [ZeroExV4.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x20cca81b0e269b265b3229d6b537da91ef475ca0ef55caed7dd30731700ba98d",
  numTopics: 1,
  abi: new Interface([
    `event ERC1155OrderFilled(
      uint8 direction,
      address maker,
      address taker,
      uint256 nonce,
      address erc20Token,
      uint256 erc20FillAmount,
      address erc1155Token,
      uint256 erc1155TokenId,
      uint128 erc1155FillAmount,
      address matcher
    )`,
  ]),
};
