import { elasticsearch } from "@/common/elasticsearch";
import { QueryDslQueryContainer, Sort } from "@elastic/elasticsearch/lib/api/types";
import { SortResults } from "@elastic/elasticsearch/lib/api/typesWithBodyKey";
import { BaseDocument } from "@/elasticsearch/indexes/base";

const INDEX_NAME = "activities";

export enum ActivityType {
  sale = "sale",
  ask = "ask",
  transfer = "transfer",
  mint = "mint",
  bid = "bid",
  bid_cancel = "bid_cancel",
  ask_cancel = "ask_cancel",
}

export interface ActivityDocument extends BaseDocument {
  timestamp: number;
  type: ActivityType;
  contract: string;
  fromAddress: string;
  toAddress: string | null;
  amount: number;
  pricing?: {
    price?: string;
    currencyPrice?: string;
    usdPrice?: number;
    feeBps?: number;
    currency?: string;
    value?: string;
    currencyValue?: string;
    normalizedValue?: string;
    currencyNormalizedValue?: string;
  };
  event?: {
    timestamp: number;
    txHash: string;
    logIndex: number;
    batchIndex: number;
    blockHash: string;
  };
  token?: {
    id: string;
    name: string;
    image: string;
  };
  collection?: {
    id: string;
    name: string;
    image: string;
  };
  order?: {
    id: string;
    side: string;
    sourceId: number;
    kind: string;
    criteria: Record<string, unknown>;
  };
}

export const save = async (activities: ActivityDocument[]): Promise<void> => {
  await elasticsearch.bulk({
    body: activities.flatMap((activity) => [
      { index: { _index: INDEX_NAME, _id: activity.id } },
      activity,
    ]),
  });
};

export const search = async (params: {
  query?: QueryDslQueryContainer | undefined;
  sort?: Sort | undefined;
  size?: number | undefined;
  search_after?: SortResults | undefined;
}): Promise<ActivityDocument[]> => {
  const esResult = await elasticsearch.search<ActivityDocument>({
    index: INDEX_NAME,
    ...params,
  });

  return esResult.hits.hits.map((hit) => hit._source!);
};

export const createIndex = async (): Promise<void> => {
  if (await elasticsearch.indices.exists({ index: INDEX_NAME })) {
    return;
  }

  await elasticsearch.indices.create({
    aliases: {
      [INDEX_NAME]: {},
    },
    index: `${INDEX_NAME}-${Date.now()}`,
    mappings: {
      dynamic: "false",
      properties: {
        id: { type: "keyword" },
        type: { type: "keyword" },
        timestamp: { type: "float" },
        name: { type: "keyword" },
        contract: { type: "keyword" },
        fromAddress: { type: "keyword" },
        toAddress: { type: "keyword" },
        amount: { type: "keyword" },
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
          },
        },
        pricing: {
          properties: {
            price: { type: "keyword" },
            currencyPrice: { type: "keyword" },
            usdPrice: { type: "keyword" },
            feeBps: { type: "integer" },
            currency: { type: "keyword" },
            value: { type: "keyword" },
            currencyValue: { type: "keyword" },
            normalizedValue: { type: "keyword" },
            currencyNormalizedValue: { type: "keyword" },
          },
        },
      },
    },
  });
};
