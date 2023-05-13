import { elasticsearch, elasticsearchCloud } from "@/common/elasticsearch";
import {
  MappingTypeMapping,
  QueryDslQueryContainer,
  Sort,
} from "@elastic/elasticsearch/lib/api/types";
import { SortResults } from "@elastic/elasticsearch/lib/api/typesWithBodyKey";
import { BaseDocument } from "@/elasticsearch/indexes/base";
import { logger } from "@/common/logger";
import { CollectionsEntity } from "@/models/collections/collections-entity";

const INDEX_NAME = "activities";

const MAPPINGS: MappingTypeMapping = {
  dynamic: "false",
  properties: {
    id: { type: "keyword" },
    createdAt: { type: "date" },
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
};

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

  if (elasticsearchCloud) {
    await elasticsearchCloud.bulk({
      body: activities.flatMap((activity) => [
        { index: { _index: INDEX_NAME, _id: activity.id } },
        activity,
      ]),
    });
  }
};

export const search = async (params: {
  query?: QueryDslQueryContainer | undefined;
  sort?: Sort | undefined;
  size?: number | undefined;
  search_after?: SortResults | undefined;
}): Promise<ActivityDocument[]> => {
  try {
    const esResult = await elasticsearch.search<ActivityDocument>({
      index: INDEX_NAME,
      ...params,
    });

    const latency = esResult.took;

    let latencyCloud;

    if (elasticsearchCloud) {
      elasticsearchCloud
        .search<ActivityDocument>({
          index: INDEX_NAME,
          ...params,
        })
        .then((esResult2) => {
          latencyCloud = esResult2.took;

          logger.info(
            "elasticsearch-search-activities",
            JSON.stringify({
              params,
              latency,
              latencyCloud,
              paramsJson: JSON.stringify(params),
            })
          );
        });
    }

    return esResult.hits.hits.map((hit) => hit._source!);
  } catch (error) {
    logger.error(
      "elasticsearch-search-activities",
      JSON.stringify({
        paramsJson: JSON.stringify(params),
        error,
      })
    );

    throw error;
  }
};

export const createIndex = async (): Promise<void> => {
  if (await elasticsearch.indices.exists({ index: INDEX_NAME })) {
    const response = await elasticsearch.indices.get({ index: INDEX_NAME });

    const indexName = Object.keys(response)[0];

    logger.info("elasticsearch-activities", "Index exists! Updating Mappings.");

    await elasticsearch.indices.putMapping({
      index: indexName,
      properties: MAPPINGS.properties,
    });

    if (elasticsearchCloud) {
      const response = await elasticsearchCloud.indices.get({ index: INDEX_NAME });

      const indexName = Object.keys(response)[0];

      await elasticsearchCloud.indices.putMapping({
        index: indexName,
        properties: MAPPINGS.properties,
      });
    }
  } else {
    logger.info("elasticsearch-activities", "Creating index!");

    await elasticsearch.indices.create({
      aliases: {
        [INDEX_NAME]: {},
      },
      index: `${INDEX_NAME}-${Date.now()}`,
      mappings: MAPPINGS,
    });

    if (elasticsearchCloud) {
      await elasticsearchCloud.indices.create({
        aliases: {
          [INDEX_NAME]: {},
        },
        index: `${INDEX_NAME}-${Date.now()}`,
        mappings: MAPPINGS,
      });
    }
  }
};

export const updateActivitiesMissingCollection = async (
  contract: string,
  tokenId: number,
  collection: CollectionsEntity
): Promise<void> => {
  const query = {
    bool: {
      must_not: [
        {
          exists: {
            field: "collection.id",
          },
        },
      ],
      must: [
        {
          term: {
            contract,
          },
        },
        {
          term: {
            "token.id": tokenId,
          },
        },
      ],
    },
  };

  await elasticsearch.updateByQuery({
    index: INDEX_NAME,
    // This is needed due to issue with elasticsearch DSL.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    query: query,
    script: {
      source:
        "ctx._source.collection = [:]; ctx._source.collection.id = params.collection_id; ctx._source.collection.name = params.collection_name; ctx._source.collection.image = params.collection_image;",
      params: {
        collection_id: collection.id,
        collection_name: collection.name,
        collection_image: collection.metadata.imageUrl,
      },
    },
  });
};
