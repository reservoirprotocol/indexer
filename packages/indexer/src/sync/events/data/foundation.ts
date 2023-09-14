import { Interface } from "@ethersproject/abi";
import { Foundation } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const buyPriceSet: EventData = {
  kind: "foundation",
  subKind: "foundation-buy-price-set",
  addresses: { [Foundation.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xfcc77ea8bdcce862f43b7fb00fe6b0eb90d6aeead27d3800d9257cf7a05f9d96",
  numTopics: 4,
  abi: new Interface([
    `event BuyPriceSet(
      address indexed nftContract,
      uint256 indexed tokenId,
      address indexed seller,
      uint256 price
    )`,
  ]),
};

export const buyPriceInvalidated: EventData = {
  kind: "foundation",
  subKind: "foundation-buy-price-invalidated",
  addresses: { [Foundation.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xaa6271d89a385571e237d3e7254ccc7c09f68055e6e9b410ed08233a8b9a05cf",
  numTopics: 3,
  abi: new Interface([
    `event BuyPriceInvalidated(
      address indexed nftContract,
      uint256 indexed tokenId
    )`,
  ]),
};

export const buyPriceCancelled: EventData = {
  kind: "foundation",
  subKind: "foundation-buy-price-cancelled",
  addresses: { [Foundation.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x70c7877531c04c7d9caa8a7eca127384f04e8a6ee58b63f778ce5401d8bcae41",
  numTopics: 3,
  abi: new Interface([
    `event BuyPriceCanceled(
      address indexed nftContract,
      uint256 indexed tokenId
    )`,
  ]),
};

export const buyPriceAccepted: EventData = {
  kind: "foundation",
  subKind: "foundation-buy-price-accepted",
  addresses: { [Foundation.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0xd28c0a7dd63bc853a4e36306655da9f8c0b29ff9d0605bb976ae420e46a99930",
  numTopics: 4,
  abi: new Interface([
    `event BuyPriceAccepted(
      address indexed nftContract,
      uint256 indexed tokenId,
      address indexed seller,
      address buyer,
      uint256 protocolFee,
      uint256 creatorFee,
      uint256 sellerRev
    )`,
  ]),
};

export const offerAccepted: EventData = {
  kind: "foundation",
  subKind: "foundation-offer-accepted",
  addresses: { [Foundation.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x1cb8adb37d6d35e94cd0695ca39895b84371864713f5ca7eada52af9ff23744b",
  numTopics: 4,
  abi: new Interface([
    `event OfferAccepted(
      address indexed nftContract,
      uint256 indexed tokenId,
      address indexed buyer,
      address seller,
      uint256 f8nFee,
      uint256 creatorFee,
      uint256 ownerRev
    )`,
  ]),
};

export const createFixedPriceSale: EventData = {
  kind: "foundation",
  subKind: "foundation-created-fixed-price-sale",
  addresses: { [Foundation.Addresses.DropMarket[config.chainId]?.toLowerCase()]: true },
  topic: "0xa4e684574cd21d7eb4df36ec6d7f86d16aa900ceddae41e4e82f8f4170f293b9",
  numTopics: 3,
  abi: new Interface([
    `event CreateFixedPriceSale(
      address indexed nftContract,
      address indexed seller,
      uint256 price,
      uint256 limitPerAccount,
      uint256 generalAvailabilityStartTime,
      uint256 earlyAccessStartTime,
      bytes32 merkleRoot,
      string merkleTreeUri
    )`,
  ]),
};

export const addMerkleRootToFixedPriceSale: EventData = {
  kind: "foundation",
  subKind: "foundation-add-merkle-root-to-fixed-price-sale",
  addresses: { [Foundation.Addresses.DropMarket[config.chainId]?.toLowerCase()]: true },
  topic: "0x7f11be7894109a714225fbb6c33d88a14582407d653ac3fc5abf07d9b3ce8914",
  numTopics: 2,
  abi: new Interface([
    `event AddMerkleRootToFixedPriceSale(
      address indexed nftContract,
      bytes32 merkleRoot,
      string merkleTreeUri
    )`,
  ]),
};
