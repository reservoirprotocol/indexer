import { Interface } from "@ethersproject/abi";

import { EventData } from "@/events-sync/data";
import { Beeple, CryptoArte, CryptoKitties, CryptoVoxels } from "@reservoir0x/sdk";
import { config } from "@/config/index";

// There are some NFTs which do not strictly adhere to the ERC721
// standard (eg. Cryptovoxels) but it would still be good to have
// support for them. We should have custom rules for these.

export const transfer: EventData = {
  kind: "erc721-transfer",
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  numTopics: 4,
  abi: new Interface([
    `event Transfer(
      address indexed from,
      address indexed to,
      uint256 indexed tokenId
    )`,
  ]),
};

export const likeTransfer: EventData = {
  kind: "erc721-like-transfer",
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  addresses: {
    [CryptoKitties.Addresses.Core[config.chainId]?.toLowerCase()]: true,
  },
  numTopics: 1,
  abi: new Interface([
    `event Transfer(
      address from,
      address to,
      uint256 tokenId
    )`,
  ]),
};

export const erc20LikeTransfer: EventData = {
  kind: "erc721-erc20-like-transfer",
  addresses: {
    [Beeple.Addresses.Contract[config.chainId]?.toLowerCase()]: true,
    [CryptoArte.Addresses.Contract[config.chainId]?.toLowerCase()]: true,
    [CryptoVoxels.Addresses.Parcel[config.chainId]?.toLowerCase()]: true,
  },
  topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  numTopics: 3,
  abi: new Interface([
    `event Transfer(
      address indexed from,
      address indexed to,
      uint256 tokenId
    )`,
  ]),
};

// The `ApprovalForAll` event is the same for erc721 and erc1155
export const approvalForAll: EventData = {
  kind: "erc721/1155-approval-for-all",
  topic: "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31",
  numTopics: 3,
  abi: new Interface([
    `event ApprovalForAll(
      address indexed owner,
      address indexed operator,
      bool approved
    )`,
  ]),
};

export const consecutiveTransfer: EventData = {
  kind: "erc721-consecutive-transfer",
  topic: "0xdeaa91b6123d068f5821d0fb0678463d1a8a6079fe8af5de3ce5e896dcf9133d",
  numTopics: 4,
  abi: new Interface([
    `event ConsecutiveTransfer(
      uint256 indexed fromTokenId,
      uint256 toTokenId,
      address indexed fromAddress,
      address indexed toAddress
    )`,
  ]),
};
