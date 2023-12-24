import { Interface } from "@ethersproject/abi";
import { ArtBlocks } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

let abi: Interface;

abi = new Interface([`event ProjectUpdated(uint256 indexed projectId, bytes32 indexed update)`]);
export const projectUpdated: EventData = {
  kind: "artblocks",
  subKind: "artblocks-project-updated",
  addresses: { [ArtBlocks.Addresses.Collection[config.chainId]?.toLowerCase()]: true },
  numTopics: 3,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("ProjectUpdated")),
};

abi = new Interface([
  `event ProjectMinterRegistered(uint256 indexed projectId, address indexed minterAddress, string minterType)`,
]);
export const projectMinterRegistered: EventData = {
  kind: "artblocks",
  subKind: "artblocks-minter-registered",
  addresses: { [ArtBlocks.Addresses.MinterFilter[config.chainId]?.toLowerCase()]: true },
  numTopics: 3,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("ProjectMinterRegistered")),
};

abi = new Interface([`event ProjectMinterRemoved(uint256 indexed projectId)`]);
export const projectMinterRemoved: EventData = {
  kind: "artblocks",
  subKind: "artblocks-minter-removed",
  addresses: { [ArtBlocks.Addresses.MinterFilter[config.chainId]?.toLowerCase()]: true },
  numTopics: 2,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("ProjectMinterRemoved")),
};

abi = new Interface([
  `event PricePerTokenInWeiUpdated(uint256 indexed projectId,uint256 indexed pricePerTokenInWei)`,
]);
export const projectPriceUpdate: EventData = {
  kind: "artblocks",
  subKind: "artblocks-project-price-update",
  numTopics: 3,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("PricePerTokenInWeiUpdated")),
};

abi = new Interface([
  `event ProjectCurrencyInfoUpdated(uint256 indexed projectId,address indexed currencyAddress,string currencySymbol)`,
]);
export const projectCurrentcyUpdate: EventData = {
  kind: "artblocks",
  subKind: "artblocks-project-currency-update",
  numTopics: 3,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("ProjectCurrencyInfoUpdated")),
};

abi = new Interface([
  `event SetAuctionDetails(uint256 indexed projectId,uint256 _auctionTimestampStart,uint256 _priceDecayHalfLifeSeconds,uint256 _startPrice,uint256 _basePrice)`,
]);
export const projectSetAuctionDetails: EventData = {
  kind: "artblocks",
  subKind: "artblocks-project-set-auction-details",
  numTopics: 2,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("SetAuctionDetails")),
};
