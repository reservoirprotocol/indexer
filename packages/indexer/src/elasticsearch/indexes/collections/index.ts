/* eslint-disable @typescript-eslint/no-explicit-any */
import { isAddress } from "@ethersproject/address";

import { elasticsearch } from "@/common/elasticsearch";
import { logger } from "@/common/logger";

import { getNetworkSettings } from "@/config/network";

import * as CONFIG from "@/elasticsearch/indexes/collections/config";
import { CollectionDocument } from "@/elasticsearch/indexes/collections/base";
import { acquireLockCrossChain } from "@/common/redis";
import { config } from "@/config/index";

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
  collectionIds?: string[];
  communities?: string[];
  excludeSpam?: boolean;
  excludeNsfw?: boolean;
  fuzzy?: boolean;
  limit?: number;
}): Promise<{ results: { collection: CollectionDocument; score: number }[] }> => {
  let esQuery = undefined;
  let esSuggest = undefined;

  try {
    if (isAddress(params.prefix)) {
      esQuery = {
        bool: {
          filter: [
            {
              term: { ["chain.id"]: config.chainId },
            },
            {
              term: { metadataDisabled: false },
            },
            {
              term: { contract: params.prefix },
            },
            {
              range: { tokenCount: { gt: 0 } },
            },
          ],
        },
      };

      if (params.collectionIds?.length) {
        const collections = params.collectionIds.map((collectionId) => collectionId.toLowerCase());

        (esQuery as any).bool.filter.push({
          terms: { "collection.id": collections },
        });
      }

      if (params.communities?.length) {
        const communities = params.communities?.map((community) => community.toLowerCase());

        (esQuery as any).bool.filter.push({
          terms: { community: communities },
        });
      }

      if (params.excludeSpam) {
        (esQuery as any).bool.filter.push({
          term: { isSpam: false },
        });
      }

      if (params.excludeNsfw) {
        (esQuery as any).bool.filter.push({
          term: { isNsfw: false },
        });
      }

      const esSearchParams = {
        index: INDEX_NAME,
        query: esQuery,
        size: params.limit,
      };

      const esResult = await elasticsearch.search<CollectionDocument>(esSearchParams);

      const results: { collection: CollectionDocument; score: number }[] = esResult.hits.hits.map(
        (hit) => {
          return { collection: hit._source!, score: hit._score! };
        }
      );

      return { results };
    } else {
      esSuggest = {
        prefix_suggestion: {
          prefix: params.prefix,
          completion: {
            field: "suggest",
            fuzzy: !!params.fuzzy,
            size: params.limit ?? 20,
            contexts: {
              chainId: [config.chainId],
              // hasTokens: [true],
              // metadataDisabled: [false],
              // isSpam: params.excludeSpam ? [false] : [true, false],
              // isNsfw: params.excludeNsfw ? [false] : [true, false],
              // id: params.collectionIds?.length ? params.collectionIds : [],
            },
          },
        },
      };

      const esSearchParams = {
        index: INDEX_NAME,
        suggest: esSuggest,
      };

      const esResult = await elasticsearch.search<CollectionDocument>(esSearchParams);

      const results: { collection: CollectionDocument; score: number }[] =
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        esResult.suggest?.prefix_suggestion[0].options.map((option: any) => {
          return { collection: option._source!, score: option._score! };
        });

      return { results };
    }
  } catch (error) {
    logger.error(
      "elasticsearch-collections",
      JSON.stringify({
        topic: "autocompleteCollections",
        params,
        esQuery,
        esSuggest,
        error,
      })
    );

    throw error;
  }
};

export const autocompleteCrosschain = async (params: {
  prefix: string;
  chains?: number[];
  communities?: string[];
  excludeSpam?: boolean;
  excludeNsfw?: boolean;
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

  (esQuery as any).bool.filter.push({
    term: { metadataDisabled: false },
  });

  if (isAddress(params.prefix)) {
    (esQuery as any).bool.must.multi_match.fields.push("contract");
  }

  if (params.chains?.length) {
    const chains = params.chains?.map((chainId) => chainId);

    (esQuery as any).bool.filter.push({
      terms: { "chain.id": chains },
    });
  }

  if (params.communities?.length) {
    const communities = params.communities?.map((community) => community.toLowerCase());

    (esQuery as any).bool.filter.push({
      terms: { community: communities },
    });
  }

  if (params.excludeSpam) {
    (esQuery as any).bool.filter.push({
      term: { isSpam: false },
    });
  }

  if (params.excludeNsfw) {
    (esQuery as any).bool.filter.push({
      term: { isNsfw: false },
    });
  }

  try {
    const esSearchParams = {
      index: INDEX_NAME,
      query: esQuery,
      sort: [
        {
          allTimeVolumeUsd: {
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
