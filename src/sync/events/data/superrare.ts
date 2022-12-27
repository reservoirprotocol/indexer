import { Interface } from "@ethersproject/abi";
import { SuperRare } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

export const listingFilled: EventData = {
  kind: "superrare-listing-filled",
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

export const bidFilled: EventData = {
  kind: "superrare-bid-filled",
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
