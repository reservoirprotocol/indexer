import { Interface } from "@ethersproject/abi";
import { SuperRare } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const listingFilled: EventData = {
  kind: "superrare",
  subKind: "superrare-listing-filled",
  addresses: { [SuperRare.Addresses.Exchange[config.chainId]?.toLowerCase()]: true },
  topic: "0x5764dbcef91eb6f946584f4ea671217c686fa7e858ce4f9f42d08422b86556a9",
  numTopics: 4,
  abi: new Interface([
    `event Sold(
      address indexed _originContract,
      address indexed _buyer,
      address indexed _seller,
      uint256 _amount,
      uint256 _tokenId
    )`,
  ]),
};

export const listingSold: EventData = {
  kind: "superrare",
  subKind: "superrare-sold",
  addresses: { [SuperRare.Addresses.Bazaar[config.chainId]?.toLowerCase()]: true },
  topic: "0x6f9e7bc841408072f4a49e469f90e1a634b85251803662bc8e5c220b28782472",
  numTopics: 4,
  abi: new Interface([
    `event Sold(
      address indexed _originContract,
      address indexed _buyer,
      address indexed _seller,
      address _currencyAddress,
      uint256 _amount,
      uint256 _tokenId
    )`,
  ]),
};

export const offerAccept: EventData = {
  kind: "superrare",
  subKind: "superrare-accept-offer",
  addresses: { [SuperRare.Addresses.Bazaar[config.chainId]?.toLowerCase()]: true },
  topic: "0x97c3d2068ce177bc33d84acecc45eededcf298c4a9d4340ae03d4afbb3993f7b",
  numTopics: 4,
  abi: new Interface([
    `event AcceptOffer(
      address indexed _originContract,
      address indexed _bidder,
      address indexed _seller,
      address _currencyAddress,
      uint256 _amount,
      uint256 _tokenId,
      address[] _splitAddresses,
      uint8[] _splitRatios
    )`,
  ]),
};

export const auctionSettled: EventData = {
  kind: "superrare",
  subKind: "superrare-auction-settled",
  addresses: { [SuperRare.Addresses.Bazaar[config.chainId]?.toLowerCase()]: true },
  topic: "0xef4e2262a841641690bb931801dc0d1923e6b417cd217f91f8049d8aa9f5f086",
  numTopics: 4,
  abi: new Interface([
    `event AuctionSettled(
      address indexed _contractAddress,
      address indexed _bidder,
      address _seller,
      uint256 indexed _tokenId,
      address _currencyAddress,
      uint256 _amount
    )`,
  ]),
};

export const setSalePrice: EventData = {
  kind: "superrare",
  subKind: "superrare-set-sale-price",
  addresses: { [SuperRare.Addresses.Bazaar[config.chainId]?.toLowerCase()]: true },
  topic: "0xb6039ff1edf80efca6bc48b89f5415ba07fecb2d321058dae9ce6369b2ff964b",
  numTopics: 3,
  abi: new Interface([
    `event SetSalePrice(
      address indexed _originContract,
      address indexed _currencyAddress,
      address _target,
      uint256 _amount,
      uint256 _tokenId,
      address[] _splitRecipients,
      uint8[] _splitRatios
    )`,
  ]),
};
