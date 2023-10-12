import { Interface } from "@ethersproject/abi";
import { Zora } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const askFilled: EventData = {
  kind: "zora",
  subKind: "zora-ask-filled",
  addresses: { [Zora.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x21a9d8e221211780696258a05c6225b1a24f428e2fd4d51708f1ab2be4224d39",
  numTopics: 4,
  abi: new Interface([
    `event AskFilled(
      address indexed tokenContract,
      uint256 indexed tokenId,
      address indexed buyer,
      address finder,
      (
        address seller,
        address sellerFundsRecipient,
        address askCurrency,
        uint16 findersFeeBps,
        uint256 askPrice
      ) ask
    )`,
  ]),
};

export const auctionEnded: EventData = {
  kind: "zora",
  subKind: "zora-auction-ended",
  addresses: { [Zora.Addresses.AuctionHouse[config.chainId]?.toLowerCase()]: true },
  topic: "0x4f35fb3ea0081b3ccbe8df613cab0f9e1694d50a025e0aa09b88a86a3d07c2de",
  numTopics: 4,
  abi: new Interface([
    `event AuctionEnded(
      uint256 indexed auctionId,
      uint256 indexed tokenId,
      address indexed tokenContract,
      address tokenOwner,
      address curator,
      address winner,
      uint256 amount,
      uint256 curatorFee,
      address auctionCurrency
    )`,
  ]),
};

export const askCreated: EventData = {
  kind: "zora",
  subKind: "zora-ask-created",
  addresses: { [Zora.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x5b65b398e1d736436510f4da442eaec71466d2abee0816567088c892c4bcee70",
  numTopics: 3,
  abi: new Interface([
    `event AskCreated(
      address indexed tokenContract,
      uint256 indexed tokenId,
      (
        address seller,
        address sellerFundsRecipient,
        address askCurrency,
        uint16 findersFeeBps,
        uint256 askPrice
      ) ask
    )`,
  ]),
};

export const askPriceUpdated: EventData = {
  kind: "zora",
  subKind: "zora-ask-price-updated",
  addresses: { [Zora.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x1a24bcf5290feab70f35cfb4870c294ebf497e608d4262b0ec0debe045008140",
  numTopics: 3,
  abi: new Interface([
    `event AskPriceUpdated(
      address indexed tokenContract,
      uint256 indexed tokenId,
      (
        address seller,
        address sellerFundsRecipient,
        address askCurrency,
        uint16 findersFeeBps,
        uint256 askPrice
      ) ask
    )`,
  ]),
};

export const askCancelled: EventData = {
  kind: "zora",
  subKind: "zora-ask-cancelled",
  addresses: { [Zora.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x871956abf85befb7c955eacd40fcabe7e01b1702d75764bf7f54bf481933fd35",
  numTopics: 3,
  abi: new Interface([
    `event AskCanceled(
      address indexed tokenContract,
      uint256 indexed tokenId,
      (
        address seller,
        address sellerFundsRecipient,
        address askCurrency,
        uint16 findersFeeBps,
        uint256 askPrice
      ) ask
    )`,
  ]),
};

export const salesConfigChanged: EventData = {
  kind: "zora",
  subKind: "zora-sales-config-changed",
  topic: "0xc1ff5e4744ac8dd2b8027a10e3723b165975297501c71c4e7dcb8796d96375db",
  numTopics: 2,
  abi: new Interface([`event SalesConfigChanged(address indexed changedBy)`]),
};

export const updatedToken: EventData = {
  kind: "zora",
  subKind: "zora-updated-token",
  topic: "0x5086d1bcea28999da9875111e3592688fbfa821db63214c695ca35768080c2fe",
  numTopics: 3,
  abi: new Interface([
    `event UpdatedToken(
      address indexed from,
      uint256 indexed tokenId,
      (
        string uri,
        uint256 maxSupply,
        uint256 totalMinted
      ) tokenData
    )`,
  ]),
};

export const mintComment: EventData = {
  kind: "zora",
  subKind: "zora-mint-comment",
  topic: "0xb9490aee663998179ad13f9e1c1eb6189c71ad1a9ec87f33ad2766f98d9a268a",
  numTopics: 4,
  abi: new Interface([
    `event MintComment(
      address indexed sender,
      address indexed tokenContract,
      uint256 indexed tokenId,
      uint256 quantity,
      string comment
    )`,
  ]),
};

// This should not have the kind set as `zora`
export const customMintComment: EventData = {
  kind: "zora",
  subKind: "zora-custom-mint-comment",
  topic: "0x2910744449a1123a8844cbafb0eb9444d337afddbf9fa11116964067fd248128",
  numTopics: 1,
  abi: new Interface([
    "event MintComment(address indexed tokenContract, uint256 quantity, string comment)",
  ]),
};
