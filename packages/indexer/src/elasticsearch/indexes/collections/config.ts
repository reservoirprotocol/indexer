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
      contract: { type: "keyword" },
      createdAt: { type: "date" },
      indexedAt: { type: "date" },
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
