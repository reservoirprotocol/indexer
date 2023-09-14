import { Interface } from "@ethersproject/abi";
import { Element } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const erc721OrderCancelled: EventData = {
  kind: "element",
  subKind: "element-erc721-order-cancelled",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xa015ad2dc32f266993958a0fd9884c746b971b254206f3478bc43e2f125c7b9e",
  numTopics: 1,
  abi: new Interface([
    `event ERC721OrderCancelled(
      address maker,
      uint256 nonce
    )`,
  ]),
};

export const hashNonceIncremented: EventData = {
  kind: "element",
  subKind: "element-hash-nonce-incremented",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x4cf3e8a83c6bf8a510613208458629675b4ae99b8029e3ab6cb6a86e5f01fd31",
  numTopics: 1,
  abi: new Interface([
    `event HashNonceIncremented(
      address maker,
      uint256 nonce
    )`,
  ]),
};

export const erc1155OrderCancelled: EventData = {
  kind: "element",
  subKind: "element-erc1155-order-cancelled",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x4d5ea7da64f50a4a329921b8d2cab52dff4ebcc58b61d10ff839e28e91445684",
  numTopics: 1,
  abi: new Interface([
    `event ERC1155OrderCancelled(
      address maker,
      uint256 nonce
    )`,
  ]),
};

export const erc721SellOrderFilled: EventData = {
  kind: "element",
  subKind: "element-erc721-sell-order-filled",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x8a0f8e04e7a35efabdc150b7d106308198a4f965a5d11badf768c5b8b273ac94",
  numTopics: 1,
  abi: new Interface([
    `event ERC721SellOrderFilled(
      address maker,
      address taker,
      address erc20Token,
      uint256 erc20TokenAmount,
      address erc721Token,
      uint256 erc721TokenId,
      bytes32 orderHash
    )`,
  ]),
};

export const erc721BuyOrderFilled: EventData = {
  kind: "element",
  subKind: "element-erc721-buy-order-filled",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xa24193d56ccdf64ce1df60c80ca683da965a1da3363efa67c14abf62b2d7d493",
  numTopics: 1,
  abi: new Interface([
    `event ERC721BuyOrderFilled(
      address maker,
      address taker,
      address erc20Token,
      uint256 erc20TokenAmount,
      address erc721Token,
      uint256 erc721TokenId,
      bytes32 orderHash
    )`,
  ]),
};

export const erc1155SellOrderFilled: EventData = {
  kind: "element",
  subKind: "element-erc1155-sell-order-filled",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x3ae452568bed7ccafe4345f10048675bae78660c7ea37eb5112b572648d4f116",
  numTopics: 1,
  abi: new Interface([
    `event ERC1155SellOrderFilled(
      address maker,
      address taker,
      address erc20Token,
      uint256 erc20FillAmount,
      address erc1155Token,
      uint256 erc1155TokenId,
      uint128 erc1155FillAmount,
      bytes32 orderHash
    )`,
  ]),
};

export const erc1155BuyOrderFilled: EventData = {
  kind: "element",
  subKind: "element-erc1155-buy-order-filled",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x020486beb4ea38db8dc504078b03c4f758de372097584b434a8b8f53583eecac",
  numTopics: 1,
  abi: new Interface([
    `event ERC1155BuyOrderFilled(
      address maker,
      address taker,
      address erc20Token,
      uint256 erc20FillAmount,
      address erc1155Token,
      uint256 erc1155TokenId,
      uint128 erc1155FillAmount,
      bytes32 orderHash
    )`,
  ]),
};

export const erc721SellOrderFilledV2: EventData = {
  kind: "element",
  subKind: "element-erc721-sell-order-filled-v2",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x9c248aa1a265aa616f707b979d57f4529bb63a4fc34dc7fc61fdddc18410f74e",
  numTopics: 1,
  abi: new Interface([
    `event ERC721SellOrderFilled(
      bytes32 orderHash,
      address maker,
      address taker,
      uint256 nonce,
      address erc20Token,
      uint256 erc20TokenAmount,
      (
        address recipient,
        uint256 amount
      )[] fees,
      address erc721Token,
      uint256 erc721TokenId
    )`,
  ]),
};

export const erc721BuyOrderFilledV2: EventData = {
  kind: "element",
  subKind: "element-erc721-buy-order-filled-v2",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xd90a5c60975c6ff8eafcf02088e7b50ae5d9e156a79206ba553df1c4fb4594c2",
  numTopics: 1,
  abi: new Interface([
    `event ERC721BuyOrderFilled(
        bytes32 orderHash,
        address maker,
        address taker,
        uint256 nonce,
        address erc20Token,
        uint256 erc20TokenAmount,
        (
            address recipient,
            uint256 amount
        )[] fees,
        address erc721Token,
        uint256 erc721TokenId
    )`,
  ]),
};

export const erc1155BuyOrderFilledV2: EventData = {
  kind: "element",
  subKind: "element-erc1155-buy-order-filled-v2",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x105616901449a64554ca9246a5bbcaca973b40b3c0055e5070c6fa191618d9f3",
  numTopics: 1,
  abi: new Interface([
    `event ERC1155BuyOrderFilled(
        bytes32 orderHash,
        address maker,
        address taker,
        uint256 nonce,
        address erc20Token,
        uint256 erc20FillAmount,
        (
            address recipient,
            uint256 amount
        )[] fees,
        address erc1155Token,
        uint256 erc1155TokenId,
        uint128 erc1155FillAmount
      )`,
  ]),
};

export const erc1155SellOrderFilledV2: EventData = {
  kind: "element",
  subKind: "element-erc1155-sell-order-filled-v2",
  addresses: { [Element.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xfcde121a3f6a9b14a3ce266d61fc00940de86c4d8c1d733fe62d503ae5d99ff9",
  numTopics: 1,
  abi: new Interface([
    `event ERC1155SellOrderFilled(
        bytes32 orderHash,
        address maker,
        address taker,
        uint256 nonce,
        address erc20Token,
        uint256 erc20FillAmount,
        (
            address recipient,
            uint256 amount
        )[] fees,
        address erc1155Token,
        uint256 erc1155TokenId,
        uint128 erc1155FillAmount
      )`,
  ]),
};
