import { MappingTypeMapping } from "@elastic/elasticsearch/lib/api/types";
import { getNetworkSettings } from "@/config/network";

export const CONFIG_DEFAULT = {
  mappings: {
    dynamic: "false",
    properties: {
      id: { type: "keyword" },
      createdAt: { type: "date" },
      indexedAt: { type: "date" },
      timestamp: { type: "date", format: "epoch_second" },
      contract: { type: "keyword" },
      token: {
        properties: {
          id: { type: "keyword" },
          name: { type: "keyword" },
          image: { type: "keyword" },
        },
      },
      collection: {
        properties: {
          id: { type: "keyword" },
          name: { type: "keyword" },
          image: { type: "keyword" },
        },
      },
      order: {
        properties: {
          id: { type: "keyword" },
          quantity: { type: "integer" },
          sourceId: { type: "integer" },
          criteria: {
            properties: {
              kind: { type: "keyword" },
              data: {
                properties: {
                  token: {
                    properties: {
                      tokenId: { type: "keyword" },
                    },
                  },
                  collection: {
                    properties: {
                      id: { type: "keyword" },
                    },
                  },
                  attribute: {
                    properties: {
                      key: { type: "keyword" },
                      value: { type: "keyword" },
                    },
                  },
                },
              },
            },
          },
          pricing: {
            properties: {
              price: { type: "keyword" },
              priceDecimal: { type: "double" },
              currencyPrice: { type: "keyword" },
              usdPrice: { type: "keyword" },
              feeBps: { type: "integer" },
              currency: { type: "keyword" },
              value: { type: "keyword" },
              valueDecimal: { type: "double" },
              currencyValue: { type: "keyword" },
              normalizedValue: { type: "keyword" },
              normalizedValueDecimal: { type: "double" },
              currencyNormalizedValue: { type: "keyword" },
            },
          },
        },
      },
      ownership: {
        properties: {
          address: { type: "keyword" },
          amount: { type: "integer" },
          acquiredAt: { type: "date" },
        },
      },
    },
  } as MappingTypeMapping,
  settings: {
    number_of_shards:
      getNetworkSettings().elasticsearch?.indexes?.tokenListings?.numberOfShards ||
      getNetworkSettings().elasticsearch?.numberOfShards ||
      1,
    number_of_replicas: 0,
  },
};
