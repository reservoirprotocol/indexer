import { MappingTypeMapping } from "@elastic/elasticsearch/lib/api/types";
import { getNetworkSettings } from "@/config/network";

export const CONFIG_DEFAULT = {
  mappings: {
    dynamic: "false",
    properties: {
      id: { type: "keyword" },
      createdAt: { type: "date" },
      indexedAt: { type: "date" },
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
          maker: { type: "keyword" },
          taker: { type: "keyword" },
          validFrom: { type: "date" },
          validUntil: { type: "date" },
          quantityFilled: { type: "long" },
          quantityRemaining: { type: "long" },
          tokenSetId: { type: "keyword" },
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
    },
  } as MappingTypeMapping,
  settings: {
    number_of_shards:
      getNetworkSettings().elasticsearch?.indexes?.asks?.numberOfShards ||
      getNetworkSettings().elasticsearch?.numberOfShards ||
      1,
    number_of_replicas: 0,
  },
};
