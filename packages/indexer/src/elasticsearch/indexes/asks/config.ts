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
      createdAt: { type: "date" },
      indexedAt: { type: "date" },
      contract: { type: "keyword" },
      contractAndTokenId: { type: "keyword" },
      token: {
        properties: {
          id: { type: "keyword" },
          name: { type: "keyword" },
          image: { type: "keyword" },
          attributes: { type: "flattened" },
          isFlagged: { type: "boolean" },
          rarityRank: { type: "integer" },
          isSpam: { type: "boolean" },
          isNsfw: { type: "boolean" },
        },
      },
      collection: {
        properties: {
          id: { type: "keyword" },
          name: { type: "keyword" },
          image: { type: "keyword" },
          isSpam: { type: "boolean" },
          isNsfw: { type: "boolean" },
          imageVersion: { type: "date", format: "epoch_second" },
        },
      },
      order: {
        properties: {
          id: { type: "keyword" },
          kind: { type: "keyword" },
          maker: { type: "keyword" },
          taker: { type: "keyword" },
          validFrom: { type: "date" },
          validUntil: { type: "date" },
          quantityFilled: { type: "keyword" },
          quantityRemaining: { type: "keyword" },
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
                  tokenSetId: { type: "keyword" },
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
          isDynamic: { type: "boolean" },
          rawData: { type: "flattened" },
          missingRoyalties: { type: "flattened" },
        },
      },
    },
  } as MappingTypeMapping,
  settings: {
    number_of_shards:
      getNetworkSettings().elasticsearch?.indexes?.asks?.numberOfShards ||
      getNetworkSettings().elasticsearch?.numberOfShards ||
      1,
    number_of_replicas: 1,
    max_result_window: 1000000,
    refresh_interval: "1s",
  },
};
