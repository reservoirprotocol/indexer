import { MappingTypeMapping } from "@elastic/elasticsearch/lib/api/types";
import { getNetworkSettings } from "@/config/network";

export const CONFIG_DEFAULT = {
  mappings: {
    dynamic: "false",
    properties: {
      chain: {
        properties: {
          id: { type: "integer" },
          name: { type: "keyword" },
        },
      },
      id: { type: "keyword" },
      createdAt: { type: "date" },
      indexedAt: { type: "date" },
      type: { type: "keyword" },
      timestamp: { type: "date", format: "epoch_second" },
      contract: { type: "keyword" },
      fromAddress: { type: "keyword" },
      toAddress: { type: "keyword" },
      amount: { type: "keyword" },
      token: {
        properties: {
          id: { type: "keyword" },
          name: { type: "keyword" },
          image: { type: "keyword" },
          media: { type: "keyword" },
          isSpam: { type: "boolean" },
        },
      },
      collection: {
        properties: {
          id: { type: "keyword" },
          name: { type: "keyword" },
          image: { type: "keyword" },
          isSpam: { type: "boolean" },
          imageVersion: { type: "date", format: "epoch_second" },
        },
      },
      order: {
        properties: {
          id: { type: "keyword" },
          side: { type: "keyword" },
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
        },
      },
      event: {
        properties: {
          timestamp: { type: "float" },
          txHash: { type: "keyword" },
          logIndex: { type: "integer" },
          batchIndex: { type: "integer" },
          blockHash: { type: "keyword" },
          fillSourceId: { type: "integer" },
          washTradingScore: { type: "double" },
          collectionIsMinting: { type: "boolean" },
          collectionMintType: { type: "keyword" },
          isAirdrop: { type: "boolean" },
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
  } as MappingTypeMapping,
  settings: {
    number_of_shards:
      getNetworkSettings().elasticsearch?.indexes?.activities?.numberOfShards ||
      getNetworkSettings().elasticsearch?.numberOfShards ||
      1,
    number_of_replicas: 0,
    sort: {
      field: ["timestamp"],
      order: ["desc"],
    },
  },
};
