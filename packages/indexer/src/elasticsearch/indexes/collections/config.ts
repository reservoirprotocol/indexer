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
      slug: { type: "keyword" },
      image: { type: "keyword" },
      contract: { type: "keyword" },
      community: { type: "keyword" },
      tokenCount: { type: "long" },
      isSpam: { type: "boolean" },
      imageVersion: { type: "date", format: "epoch_second" },
      metadataDisabled: { type: "boolean" },
      createdAt: { type: "date" },
      indexedAt: { type: "date" },
      allTimeVolume: { type: "double" },
      allTimeVolumeDecimal: { type: "double" },
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
