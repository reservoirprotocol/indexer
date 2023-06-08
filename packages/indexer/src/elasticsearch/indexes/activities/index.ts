/* eslint-disable @typescript-eslint/no-explicit-any */

import { elasticsearch } from "@/common/elasticsearch";

import {
  MappingTypeMapping,
  QueryDslQueryContainer,
  Sort,
} from "@elastic/elasticsearch/lib/api/types";
import { SortResults } from "@elastic/elasticsearch/lib/api/typesWithBodyKey";
import { logger } from "@/common/logger";
import { CollectionsEntity } from "@/models/collections/collections-entity";
import { ActivityDocument, ActivityType } from "@/elasticsearch/indexes/activities/base";
import { getNetworkName, getNetworkSettings } from "@/config/network";
import _ from "lodash";
import { buildContinuation, splitContinuation } from "@/common/utils";
import { addToQueue as backfillActivitiesAddToQueue } from "@/jobs/elasticsearch/backfill-activities-elasticsearch";
import { TokensEntity } from "@/models/tokens/tokens-entity";

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
        media: { type: "keyword" },
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

export const save = async (activities: ActivityDocument[], upsert = true): Promise<void> => {
  try {
    const response = await elasticsearch.bulk({
      body: activities.flatMap((activity) => [
        { [upsert ? "index" : "create"]: { _index: INDEX_NAME, _id: activity.id } },
        activity,
      ]),
    });

    if (response.errors) {
      if (upsert) {
        logger.error(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "save-errors",
            upsert,
            data: {
              activities: JSON.stringify(activities),
            },
            response,
          })
        );
      } else {
        logger.debug(
          "elasticsearch-activities",
          JSON.stringify({
            topic: "save-conflicts",
            upsert,
            data: {
              activities: JSON.stringify(activities),
            },
            response,
          })
        );
      }
    }
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "save",
        upsert,
        data: {
          activities: JSON.stringify(activities),
        },
        error,
      })
    );

    throw error;
  }
};

export const search = async (
  params: {
    types?: ActivityType;
    tokens?: { contract: string; tokenId: string }[];
    contracts?: string[];
    collections?: string[];
    sources?: number[];
    users?: string[];
    sortBy?: "timestamp" | "createdAt";
    limit?: number;
    continuation?: string;
    continuationAsInt?: boolean;
  },
  debug = false
): Promise<{ activities: ActivityDocument[]; continuation: string | null }> => {
  const esQuery = {};

  (esQuery as any).bool = { filter: [] };

  if (params.types?.length) {
    (esQuery as any).bool.filter.push({ terms: { type: params.types } });
  }

  if (params.collections?.length) {
    const collections = params.collections.map((collection) => collection.toLowerCase());

    (esQuery as any).bool.filter.push({
      terms: { "collection.id": collections },
    });
  }

  if (params.contracts?.length) {
    const contracts = params.contracts.map((contract) => contract.toLowerCase());

    (esQuery as any).bool.filter.push({
      terms: { contract: contracts },
    });
  }

  if (params.sources?.length) {
    (esQuery as any).bool.filter.push({
      terms: { "order.sourceId": params.sources },
    });
  }

  if (params.tokens?.length) {
    if (params.contracts?.length === 1) {
      (esQuery as any).bool.filter.push({
        terms: { "token.id": params.tokens.map((token) => token.tokenId) },
      });
    } else {
      const tokensFilter = { bool: { should: [] } };

      for (const token of params.tokens) {
        const contract = token.contract.toLowerCase();
        const tokenId = token.tokenId;

        (tokensFilter as any).bool.should.push({
          bool: {
            must: [
              {
                term: { contract },
              },
              {
                term: { ["token.id"]: tokenId },
              },
            ],
          },
        });
      }

      (esQuery as any).bool.filter.push(tokensFilter);
    }
  }

  if (params.users?.length) {
    const users = params.users.map((user) => user.toLowerCase());

    const usersFilter = { bool: { should: [] } };

    (usersFilter as any).bool.should.push({
      terms: { fromAddress: users },
    });

    (usersFilter as any).bool.should.push({
      terms: { toAddress: users },
    });

    (esQuery as any).bool.filter.push(usersFilter);
  }

  const esSort: any[] = [];

  if (params.sortBy == "timestamp") {
    esSort.push({ timestamp: { order: "desc" } });
  } else {
    esSort.push({ createdAt: { order: "desc" } });
  }

  let searchAfter;

  if (params.continuation) {
    if (params.continuationAsInt) {
      searchAfter = [params.continuation];
    } else {
      searchAfter = [splitContinuation(params.continuation)[0]];
    }
  }

  try {
    const activities = await _search(
      {
        query: esQuery,
        sort: esSort as Sort,
        size: params.limit,
        search_after: searchAfter,
      },
      0,
      debug
    );

    let continuation = null;

    if (activities.length === params.limit) {
      const lastActivity = _.last(activities);

      if (lastActivity) {
        if (params.continuationAsInt) {
          continuation = `${lastActivity.timestamp}`;
        } else {
          const continuationValue =
            params.sortBy == "timestamp"
              ? lastActivity.timestamp
              : new Date(lastActivity.createdAt).toISOString();
          continuation = buildContinuation(`${continuationValue}`);
        }
      }
    }

    return { activities, continuation };
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "search",
        data: {
          params: params,
        },
        error,
      })
    );

    throw error;
  }
};

const _search = async (
  params: {
    query?: QueryDslQueryContainer | undefined;
    sort?: Sort | undefined;
    size?: number | undefined;
    search_after?: SortResults | undefined;
    track_total_hits?: boolean;
  },
  retries = 0,
  debug = false
): Promise<ActivityDocument[]> => {
  try {
    const esResult = await elasticsearch.search<ActivityDocument>({
      index: INDEX_NAME,
      ...params,
    });

    const results = esResult.hits.hits.map((hit) => hit._source!);

    if (retries > 0 || debug) {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "_search",
          latency: esResult.took,
          params: JSON.stringify(params),
          retries,
        })
      );
    }

    return results;
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "_search",
        data: {
          params: JSON.stringify(params),
        },
        error,
        retries,
      })
    );

    if ((error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception") {
      logger.warn(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "_search",
          message: "node_not_connected_exception error",
          data: {
            params: JSON.stringify(params),
          },
          error,
          retries,
        })
      );

      if (retries <= 3) {
        retries += 1;
        return _search(params, retries, debug);
      }

      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "_search",
          message: "Max retries reached.",
          data: {
            params: JSON.stringify(params),
          },
          error,
          retries,
        })
      );

      throw new Error("Could not perform search.");
    }

    throw error;
  }
};

export const initIndex = async (): Promise<void> => {
  try {
    if (await elasticsearch.indices.exists({ index: INDEX_NAME })) {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "initIndex",
          message: "Index already exists.",
          indexName: INDEX_NAME,
        })
      );

      const getIndexResponse = await elasticsearch.indices.get({ index: INDEX_NAME });

      const indexName = Object.keys(getIndexResponse)[0];

      const putMappingResponse = await elasticsearch.indices.putMapping({
        index: indexName,
        properties: MAPPINGS.properties,
      });

      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "initIndex",
          message: "Updated mappings.",
          indexName: INDEX_NAME,
          mappings: MAPPINGS.properties,
          putMappingResponse,
        })
      );
    } else {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "initIndex",
          message: "Creating Index.",
          indexName: INDEX_NAME,
        })
      );

      const params = {
        aliases: {
          [INDEX_NAME]: {},
        },
        index: `${INDEX_NAME}-${Date.now()}`,
        mappings: MAPPINGS,
        settings: {
          number_of_shards:
            getNetworkSettings().elasticsearch?.indexes?.activities?.numberOfShards ||
            getNetworkSettings().elasticsearch?.numberOfShards ||
            1,
          sort: {
            field: ["timestamp", "createdAt"],
            order: ["desc", "desc"],
          },
        },
      };

      const createIndexResponse = await elasticsearch.indices.create(params);

      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "initIndex",
          message: "Index Created!",
          indexName: INDEX_NAME,
          params,
          createIndexResponse,
        })
      );

      await backfillActivitiesAddToQueue(false);
    }
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "initIndex",
        message: "Error.",
        indexName: INDEX_NAME,
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
            contract: contract.toLowerCase(),
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

  try {
    const response = await elasticsearch.updateByQuery({
      index: INDEX_NAME,
      conflicts: "proceed",
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

    if (response?.failures?.length) {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesMissingCollection",
          data: {
            contract,
            tokenId,
            collection,
          },
          query: JSON.stringify(query),
          response,
        })
      );
    } else {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesMissingCollection",
          data: {
            contract,
            tokenId,
            collection,
          },
          query: JSON.stringify(query),
          response,
        })
      );
    }
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

export const updateActivitiesCollection = async (
  contract: string,
  tokenId: string,
  newCollection: CollectionsEntity,
  oldCollectionId: string
): Promise<void> => {
  const query = {
    bool: {
      must: [
        {
          term: {
            contract: contract.toLowerCase(),
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

  try {
    const response = await elasticsearch.updateByQuery({
      index: INDEX_NAME,
      conflicts: "proceed",
      // This is needed due to issue with elasticsearch DSL.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      query,
      script: {
        source:
          "ctx._source.collection = [:]; ctx._source.collection.id = params.collection_id; ctx._source.collection.name = params.collection_name; ctx._source.collection.image = params.collection_image;",
        params: {
          collection_id: newCollection.id,
          collection_name: newCollection.name,
          collection_image: newCollection.metadata.imageUrl,
        },
      },
    });

    if (response?.failures?.length) {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesCollection",
          data: {
            contract,
            tokenId,
            newCollection,
            oldCollectionId,
          },
          query: JSON.stringify(query),
          response,
        })
      );
    } else {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesCollection",
          data: {
            contract,
            tokenId,
            newCollection,
            oldCollectionId,
          },
          query: JSON.stringify(query),
          response,
        })
      );
    }
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "updateActivitiesCollection",
        data: {
          contract,
          tokenId,
          oldCollectionId,
          newCollection,
        },
        query: JSON.stringify(query),
        error,
      })
    );

    throw error;
  }
};

export const updateActivitiesTokenMetadata = async (
  contract: string,
  tokenId: string,
  tokenData: TokensEntity
): Promise<void> => {
  const query = {
    bool: {
      must: [
        {
          term: {
            contract: contract.toLowerCase(),
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

  try {
    const response = await elasticsearch.updateByQuery({
      index: INDEX_NAME,
      conflicts: "proceed",
      slices: "auto",
      // This is needed due to issue with elasticsearch DSL.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      query,
      script: {
        source:
          "ctx._source.token.name = params.token_name; ctx._source.token.image = params.token_image; ctx._source.token.media = params.token_media;",
        params: {
          token_name: tokenData.name,
          token_image: tokenData.image,
          token_media: tokenData.media,
        },
      },
    });

    if (response?.failures?.length) {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesTokenMetadata",
          data: {
            contract,
            tokenId,
            tokenData,
          },
          query: JSON.stringify(query),
          response,
        })
      );
    } else {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesTokenMetadata",
          data: {
            contract,
            tokenId,
            tokenData,
          },
          query: JSON.stringify(query),
          response,
        })
      );
    }
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "updateActivitiesTokenMetadata",
        data: {
          contract,
          tokenId,
          tokenData,
        },
        query: JSON.stringify(query),
        error,
      })
    );

    throw error;
  }
};

export const updateActivitiesCollectionMetadata = async (
  collectionId: string,
  collectionData: CollectionsEntity
): Promise<void> => {
  const query = {
    bool: {
      must: [
        {
          term: {
            "collection.id": collectionId.toLowerCase(),
          },
        },
      ],
    },
  };

  try {
    const response = await elasticsearch.updateByQuery({
      index: INDEX_NAME,
      conflicts: "proceed",
      // This is needed due to issue with elasticsearch DSL.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      query,
      script: {
        source:
          "ctx._source.collection.name = params.collection_name; ctx._source.collection.image = params.collection_image;",
        params: {
          collection_name: collectionData.name,
          collection_image: collectionData.metadata.imageUrl,
        },
      },
    });

    if (response?.failures?.length) {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesCollectionMetadata",
          data: {
            collectionId,
            collectionData,
          },
          query: JSON.stringify(query),
          response,
        })
      );
    } else {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "updateActivitiesCollectionMetadata",
          data: {
            collectionId,
            collectionData,
          },
          query: JSON.stringify(query),
          response,
        })
      );
    }
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "updateActivitiesCollectionMetadata",
        data: {
          collectionId,
          collectionData,
        },
        query: JSON.stringify(query),
        error,
      })
    );

    throw error;
  }
};

export const deleteActivitiesByBlockHash = async (blockHash: string): Promise<void> => {
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

  try {
    const response = await elasticsearch.deleteByQuery({
      index: INDEX_NAME,
      conflicts: "proceed",
      // This is needed due to issue with elasticsearch DSL.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      query: query,
    });

    if (response?.failures?.length) {
      logger.error(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "deleteActivitiesByBlockHash",
          data: {
            blockHash,
          },
          query,
          response,
        })
      );
    } else {
      logger.info(
        "elasticsearch-activities",
        JSON.stringify({
          topic: "deleteActivitiesByBlockHash",
          data: {
            blockHash,
          },
          query,
          response,
        })
      );
    }
  } catch (error) {
    logger.error(
      "elasticsearch-activities",
      JSON.stringify({
        topic: "deleteActivitiesByBlockHash",
        data: {
          blockHash,
        },
        query: JSON.stringify(query),
        error,
      })
    );

    throw error;
  }
};
