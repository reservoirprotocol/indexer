/* eslint-disable @typescript-eslint/no-explicit-any */
import { isAddress } from "@ethersproject/address";

import { elasticsearch } from "@/common/elasticsearch";
import { logger } from "@/common/logger";

import { getNetworkSettings } from "@/config/network";

import * as CONFIG from "@/elasticsearch/indexes/collections/config";
import { CollectionDocument } from "@/elasticsearch/indexes/collections/base";
import { acquireLockCrossChain } from "@/common/redis";

const INDEX_NAME = `collections`;

export const save = async (collections: CollectionDocument[], upsert = true): Promise<void> => {
  try {
    const response = await elasticsearch.bulk({
      body: collections.flatMap((collection) => [
        { [upsert ? "index" : "create"]: { _index: INDEX_NAME, _id: collection.id } },
        collection,
      ]),
    });

    if (response.errors) {
      if (upsert) {
        logger.error(
          "elasticsearch-collections",
          JSON.stringify({
            topic: "save-errors",
            upsert,
            data: {
              collections: JSON.stringify(collections),
            },
            response,
          })
        );
      } else {
        logger.debug(
          "elasticsearch-collections",
          JSON.stringify({
            topic: "save-conflicts",
            upsert,
            data: {
              collections: JSON.stringify(collections),
            },
            response,
          })
        );
      }
    }
  } catch (error) {
    logger.error(
      "elasticsearch-collections",
      JSON.stringify({
        topic: "save",
        upsert,
        data: {
          collections: JSON.stringify(collections),
        },
        error,
      })
    );

    throw error;
  }
};

export const getIndexName = (): string => {
  return INDEX_NAME;
};

export const initIndex = async (): Promise<void> => {
  const acquiredLock = await acquireLockCrossChain("elasticsearch-collections-init-index", 60);

  if (!acquiredLock) {
    logger.info(
      "elasticsearch-collections",
      JSON.stringify({
        topic: "initIndex",
        message: "Skip.",
      })
    );

    return;
  }

  try {
    const indexConfigName =
      getNetworkSettings().elasticsearch?.indexes?.collections?.configName ?? "CONFIG_DEFAULT";

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const indexConfig = CONFIG[indexConfigName];

    if (await elasticsearch.indices.exists({ index: INDEX_NAME })) {
      logger.info(
        "elasticsearch-collections",
        JSON.stringify({
          topic: "initIndex",
          message: "Index already exists.",
          indexName: INDEX_NAME,
          indexConfig,
        })
      );

      if (getNetworkSettings().elasticsearch?.indexes?.collections?.disableMappingsUpdate) {
        logger.info(
          "elasticsearch-collections",
          JSON.stringify({
            topic: "initIndex",
            message: "Mappings update disabled.",
            indexName: INDEX_NAME,
            indexConfig,
          })
        );

        return;
      }

      const getIndexResponse = await elasticsearch.indices.get({ index: INDEX_NAME });

      const indexName = Object.keys(getIndexResponse)[0];

      const putMappingResponse = await elasticsearch.indices.putMapping({
        index: indexName,
        properties: indexConfig.mappings.properties,
      });

      logger.info(
        "elasticsearch-collections",
        JSON.stringify({
          topic: "initIndex",
          message: "Updated mappings.",
          indexName: INDEX_NAME,
          indexConfig,
          putMappingResponse,
        })
      );
    } else {
      logger.info(
        "elasticsearch-collections",
        JSON.stringify({
          topic: "initIndex",
          message: "Creating Index.",
          indexName: INDEX_NAME,
          indexConfig,
        })
      );

      const params = {
        aliases: {
          [INDEX_NAME]: {},
        },
        index: `${INDEX_NAME}-${Date.now()}`,
        ...indexConfig,
      };

      const createIndexResponse = await elasticsearch.indices.create(params);

      logger.info(
        "elasticsearch-collections",
        JSON.stringify({
          topic: "initIndex",
          message: "Index Created!",
          indexName: INDEX_NAME,
          indexConfig,
          params,
          createIndexResponse,
        })
      );
    }
  } catch (error) {
    logger.error(
      "elasticsearch-collections",
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

export const autocomplete = async (params: {
  prefix: string;
  chains?: number[];
  communities?: string[];
  isSpam?: boolean;
  limit?: number;
}): Promise<{ collections: CollectionDocument[] }> => {
  const esQuery = {
    bool: {
      must: {
        multi_match: {
          query: params.prefix,
          type: "bool_prefix",
          analyzer: "keyword",
          fields: ["name", "name._2gram", "name._3gram"],
        },
      },
      filter: [
        {
          range: { tokenCount: { gt: 0 } },
        },
      ],
    },
  };

  if (isAddress(params.prefix)) {
    (esQuery as any).bool.must.multi_match.fields.push("contract");
  }

  if (params.chains?.length) {
    const chains = params.chains?.map((chainId) => chainId);

    (esQuery as any).bool.filter.push({
      terms: { "chain.id": chains },
    });

    (esQuery as any).bool.filter.push({
      term: { metadataDisabled: false },
    });

    (esQuery as any).bool.filter.push({
      term: { isSpam: false },
    });
  }

  if (params.communities?.length) {
    const communities = params.communities?.map((community) => community.toLowerCase());

    (esQuery as any).bool.filter.push({
      terms: { community: communities },
    });
  }

  try {
    const esSearchParams = {
      index: INDEX_NAME,
      query: esQuery,
      sort: [
        {
          allTimeVolumeDecimal: {
            order: "desc",
          },
        },
        {
          _score: {
            order: "desc",
          },
        },
      ],
      size: params.limit,
    };

    const esResult = await elasticsearch.search<CollectionDocument>(esSearchParams);

    logger.info(
      "elasticsearch-collections",
      JSON.stringify({
        topic: "autocompleteCollections",
        message: "Debug result",
        data: {
          esSearchParamsJSON: JSON.stringify(esSearchParams),
        },
      })
    );

    const collections: CollectionDocument[] = esResult.hits.hits.map((hit) => hit._source!);

    return { collections };
  } catch (error) {
    logger.error(
      "elasticsearch-collections",
      JSON.stringify({
        topic: "autocompleteCollections",
        data: {
          params: params,
        },
        error,
      })
    );

    throw error;
  }
};
