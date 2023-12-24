import { Interface } from "@ethersproject/abi";
import { HighlightXyz } from "@reservoir0x/sdk";

import { config } from "@/config/index";
import { EventData } from "@/events-sync/data";

const abi = new Interface([
  "event EditionVectorCreated(uint256 indexed vectorId, uint48 indexed editionId, address indexed contractAddress)",
  "event SeriesVectorCreated(uint256 indexed vectorId, address indexed contractAddress)",
  "event VectorUpdated(uint256 indexed vectorId)",
  "event VectorDeleted(uint256 indexed vectorId)",
  "event DiscreteDutchAuctionCreated(bytes32 indexed vectorId)",
  `event MechanicVectorRegistered(
      bytes32 indexed vectorId,
      address indexed mechanic,
      address indexed contractAddress,
      uint256 editionId,
      bool isEditionBased
  )`,
  "event DiscreteDutchAuctionUpdated(bytes32 indexed vectorId)",
]);

export const editonVectorCreated: EventData = {
  kind: "highlightxyz",
  subKind: "highlightxyz-edition-vector-created",
  addresses: { [HighlightXyz.Addresses.MintManager[config.chainId]?.toLowerCase()]: true },
  numTopics: 4,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("EditionVectorCreated")),
};

export const seriesVectorCreated: EventData = {
  kind: "highlightxyz",
  subKind: "highlightxyz-series-vector-created",
  addresses: { [HighlightXyz.Addresses.MintManager[config.chainId]?.toLowerCase()]: true },
  numTopics: 3,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("SeriesVectorCreated")),
};

export const vectorUpdated: EventData = {
  kind: "highlightxyz",
  subKind: "highlightxyz-vector-updated",
  addresses: { [HighlightXyz.Addresses.MintManager[config.chainId]?.toLowerCase()]: true },
  numTopics: 2,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("VectorUpdated")),
};

export const vectorDeleted: EventData = {
  kind: "highlightxyz",
  subKind: "highlightxyz-vector-deleted",
  addresses: { [HighlightXyz.Addresses.MintManager[config.chainId]?.toLowerCase()]: true },
  numTopics: 2,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("VectorDeleted")),
};

export const discreteDACreated: EventData = {
  kind: "highlightxyz",
  subKind: "highlightxyz-discrete-da-created",
  addresses: { [HighlightXyz.Addresses.MintManager[config.chainId]?.toLowerCase()]: true },
  numTopics: 2,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("DiscreteDutchAuctionCreated")),
};

export const mechanicVectorRegistered: EventData = {
  kind: "highlightxyz",
  subKind: "highlightxyz-mechanic-vector-registered",
  addresses: { [HighlightXyz.Addresses.MintManager[config.chainId]?.toLowerCase()]: true },
  numTopics: 4,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("MechanicVectorRegistered")),
};

export const mechanicVectorUpdated: EventData = {
  kind: "highlightxyz",
  subKind: "highlightxyz-discrete-da-updated",
  addresses: {
    [HighlightXyz.Addresses.DiscreteDutchAuctionMechanic[config.chainId]?.toLowerCase()]: true,
  },
  numTopics: 2,
  abi: abi,
  topic: abi.getEventTopic(abi.getEvent("DiscreteDutchAuctionUpdated")),
};
