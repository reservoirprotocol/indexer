import { MappingTypeMapping } from "@elastic/elasticsearch/lib/api/types";
import { getNetworkSettings } from "@/config/network";

export const CONFIG_DEFAULT = {
  mappings: {
    dynamic: "false",
    properties: {
      chain: {
        properties: {
          id: { type: "long" },
          name: { type: "keyword" },
        },
      },
      id: { type: "keyword" },
      name: {
        type: "search_as_you_type",
        max_shingle_size: 3,
      },
      suggest: {
        type: "completion",
        preserve_separators: false,
        contexts: [
          {
            name: "chainId",
            type: "category",
          },
          {
            name: "id",
            type: "category",
          },
          {
            name: "community",
            type: "category",
          },
          {
            name: "hasTokens",
            type: "category",
          },
          {
            name: "isSpam",
            type: "category",
          },
          {
            name: "isNsfw",
            type: "category",
          },
          {
            name: "metadataDisabled",
            type: "category",
          },
        ],
      },
      suggestV2: {
        type: "completion",
        preserve_separators: false,
        analyzer: "standard",
        search_analyzer: "standard",
        contexts: [
          {
            name: "filters",
            type: "category",
          },
        ],
      },
      suggestV3: {
        type: "completion",
        preserve_separators: false,
        analyzer: "standard",
        search_analyzer: "standard",
        contexts: [
          {
            name: "filters",
            type: "category",
          },
          {
            name: "isVerified",
            type: "category",
          },
        ],
      },
      slug: { type: "keyword" },
      image: { type: "keyword" },
      contract: { type: "keyword" },
      contractSymbol: { type: "keyword" },
      community: { type: "keyword" },
      tokenCount: { type: "long" },
      isSpam: { type: "boolean" },
      isNsfw: { type: "boolean" },
      imageVersion: { type: "date", format: "epoch_second" },
      metadataDisabled: { type: "boolean" },
      createdAt: { type: "date" },
      indexedAt: { type: "date" },
      day1Rank: { type: "integer" },
      day1Volume: { type: "double" },
      day1VolumeDecimal: { type: "double" },
      day1VolumeUsd: { type: "double" },
      day7Rank: { type: "integer" },
      day7Volume: { type: "double" },
      day7VolumeDecimal: { type: "double" },
      day7VolumeUsd: { type: "double" },
      day30Rank: { type: "integer" },
      day30Volume: { type: "double" },
      day30VolumeDecimal: { type: "double" },
      day30VolumeUsd: { type: "double" },
      alltimeRank: { type: "integer" },
      allTimeVolume: { type: "double" },
      allTimeVolumeDecimal: { type: "double" },
      allTimeVolumeUsd: { type: "double" },
      algoVolumeDecimal: { type: "double" },
      algoVolumeUsd: { type: "double" },
      floorSell: {
        properties: {
          id: { type: "keyword" },
          value: { type: "keyword" },
          currency: { type: "keyword" },
          currencyPrice: { type: "keyword" },
        },
      },
    },
  } as MappingTypeMapping,
  settings: {
    number_of_shards:
      getNetworkSettings().elasticsearch?.indexes?.collections?.numberOfShards ||
      getNetworkSettings().elasticsearch?.numberOfShards ||
      1,
    number_of_replicas: 0,
  },
};
