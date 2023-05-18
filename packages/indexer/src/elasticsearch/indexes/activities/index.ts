import { elasticsearch, elasticsearchCloud } from "@/common/elasticsearch";
import {
  MappingTypeMapping,
  QueryDslQueryContainer,
  Sort,
} from "@elastic/elasticsearch/lib/api/types";
import { SortResults } from "@elastic/elasticsearch/lib/api/typesWithBodyKey";
import { logger } from "@/common/logger";
import { CollectionsEntity } from "@/models/collections/collections-entity";
import { ActivityDocument } from "@/elasticsearch/indexes/activities/base";
import { getNetworkName } from "@/config/network";
import { config } from "@/config/index";

const INDEX_NAME = `${getNetworkName()}.activities`;

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

export const save = async (activities: ActivityDocument[]): Promise<void> => {
  try {
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
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "save",
        data: {
          activities: JSON.stringify(activities),
        },
        error,
      })
    );

    throw error;
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

    logger.info(
      "elasticsearch-search-activities-v2",
      JSON.stringify({
        params,
        latency,
        paramsJson: JSON.stringify(params),
      })
    );

    return esResult.hits.hits.map((hit) => hit._source!);
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "search",
        data: {
          params: JSON.stringify(params),
        },
        error,
      })
    );

    throw error;
  }
};

export const createIndex = async (): Promise<void> => {
  try {
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
        settings: {
          number_of_shards: config.chainId === 5 ? 4 : 40,
          sort: {
            field: ["timestamp", "createdAt"],
            order: ["desc", "desc"],
          },
        },
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
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "createIndex",
        error,
      })
    );

    throw error;
  }
};

export const updateActivitiesMissingCollection = async (
  contract: string,
  tokenId: number,
  collection: CollectionsEntity
): Promise<void> => {
  try {
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
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "updateActivitiesMissingCollection",
        data: {
          contract,
          tokenId,
          collection,
        },
        error,
      })
    );

    throw error;
  }
};

export const deleteActivitiesByBlockHash = async (blockHash: string): Promise<void> => {
  try {
    const query = {
      bool: {
        must: [
          {
            term: {
              "event.blockHash": blockHash,
            },
          },
        ],
      },
    };

    await elasticsearch.deleteByQuery({
      index: INDEX_NAME,
      // This is needed due to issue with elasticsearch DSL.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      query: query,
    });
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "deleteActivitiesByBlockHash",
        data: {
          blockHash,
        },
        error,
      })
    );

    throw error;
  }
};
