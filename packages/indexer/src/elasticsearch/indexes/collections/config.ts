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
      name: { type: "keyword" },
      slug: { type: "keyword" },
      image: { type: "keyword" },
      contract: { type: "keyword" },
      community: { type: "keyword" },
      tokenCount: { type: "long" },
      isSpam: { type: "boolean" },
      createdAt: { type: "date" },
      indexedAt: { type: "date" },
      nameSuggest: {
        type: "completion",
        contexts: [
          {
            name: "chainId",
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
        ],
      },
      nameSuggestV2: {
        type: "completion",
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
        ],
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
