/* eslint-disable @typescript-eslint/no-explicit-any */

import { elasticsearch } from "@/common/elasticsearch";
import { logger } from "@/common/logger";

import { getNetworkName, getNetworkSettings } from "@/config/network";

import * as CONFIG from "@/elasticsearch/indexes/asks/config";
import { AskDocument } from "@/elasticsearch/indexes/asks/base";
import { buildContinuation, splitContinuation } from "@/common/utils";

import {
  AggregationsAggregate,
  QueryDslQueryContainer,
  SearchResponse,
  Sort,
  SortResults,
} from "@elastic/elasticsearch/lib/api/types";

const INDEX_NAME = `${getNetworkName()}.asks`;

export const save = async (asks: AskDocument[], upsert = true): Promise<void> => {
  try {
    const response = await elasticsearch.bulk({
      body: asks.flatMap((ask) => [
        { [upsert ? "index" : "create"]: { _index: INDEX_NAME, _id: ask.id } },
        ask,
      ]),
    });

    if (response.errors) {
      if (upsert) {
        logger.error(
          "elasticsearch-asks",
          JSON.stringify({
            topic: "save-errors",
            upsert,
            data: {
              asks: JSON.stringify(asks),
            },
            response,
          })
        );
      } else {
        logger.debug(
          "elasticsearch-asks",
          JSON.stringify({
            topic: "save-conflicts",
            upsert,
            data: {
              asks: JSON.stringify(asks),
            },
            response,
          })
        );
      }
    }
  } catch (error) {
    logger.error(
      "elasticsearch-asks",
      JSON.stringify({
        topic: "save",
        upsert,
        data: {
          asks: JSON.stringify(asks),
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
  try {
    const indexConfigName =
      getNetworkSettings().elasticsearch?.indexes?.asks?.configName ?? "CONFIG_DEFAULT";

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const indexConfig = CONFIG[indexConfigName];

    if (await elasticsearch.indices.exists({ index: INDEX_NAME })) {
      logger.info(
        "elasticsearch-asks",
        JSON.stringify({
          topic: "initIndex",
          message: "Index already exists.",
          indexName: INDEX_NAME,
          indexConfig,
        })
      );

      if (getNetworkSettings().elasticsearch?.indexes?.asks?.disableMappingsUpdate) {
        logger.info(
          "elasticsearch-asks",
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
        "elasticsearch-asks",
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
        "elasticsearch-asks",
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
        "elasticsearch-asks",
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
      "elasticsearch-asks",
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

export const searchTokenAsks = async (params: {
  tokens?: { contract: string; tokenId: string }[];
  contracts?: string[];
  collections?: string[];
  currencies?: string[];
  orderKinds?: { operation: "include" | "exclude"; kinds: string[] };
  rarityRank?: { min?: number; max?: number };
  floorAskPrice?: { min?: number; max?: number };
  normalizeRoyalties?: boolean;
  spamTokens?: { operation: "include" | "exclude" };
  flaggedTokens?: { operation: "include" | "exclude" };
  sources?: number[];
  limit?: number;
  continuation?: string | null;
}): Promise<{ asks: AskDocument[]; continuation: string | null }> => {
  const esQuery = {};

  (esQuery as any).bool = { filter: [], must_not: [] };

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

  if (params.currencies?.length) {
    (esQuery as any).bool.filter.push({
      terms: { "order.pricing.currency": params.currencies },
    });
  }

  if (params.orderKinds?.kinds.length) {
    if (params.orderKinds?.operation === "exclude") {
      (esQuery as any).bool.must_not.push({
        terms: { "order.kind": params.orderKinds.kinds },
      });
    } else {
      (esQuery as any).bool.filter.push({
        terms: { "order.kind": params.orderKinds.kinds },
      });
    }
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

  (esQuery as any).bool.filter.push({
    term: { "order.taker": "0x0000000000000000000000000000000000000000" },
  });

  if (params.flaggedTokens) {
    if (params.flaggedTokens.operation === "exclude") {
      (esQuery as any).bool.must_not.push({
        term: { "token.isFlagged": true },
      });
    } else {
      (esQuery as any).bool.filter.push({
        term: { "token.isFlagged": true },
      });
    }
  }

  if (params.spamTokens) {
    if (params.spamTokens.operation === "exclude") {
      (esQuery as any).bool.must_not.push({
        term: { "token.isSpam": true },
      });
      (esQuery as any).bool.must_not.push({
        term: { "collection.isSpam": true },
      });
    } else {
      (esQuery as any).bool.filter.push({
        term: { "token.isSpam": true },
      });
      (esQuery as any).bool.filter.push({
        term: { "collection.isSpam": true },
      });
    }
  }

  if (params.rarityRank?.min) {
    (esQuery as any).bool.filter.push({
      range: { timestamp: { gte: params.rarityRank?.min } },
    });
  }

  if (params.rarityRank?.max) {
    (esQuery as any).bool.filter.push({
      range: { timestamp: { lte: params.rarityRank?.max } },
    });
  }

  if (params.floorAskPrice?.min) {
    (esQuery as any).bool.filter.push({
      range: {
        [params.normalizeRoyalties
          ? "order.pricing.normalizedValueDecimal"
          : "order.pricing.priceDecimal"]: { gte: params.floorAskPrice?.min },
      },
    });
  }

  if (params.floorAskPrice?.max) {
    (esQuery as any).bool.filter.push({
      range: {
        [params.normalizeRoyalties
          ? "order.pricing.normalizedValueDecimal"
          : "order.pricing.priceDecimal"]: { lte: params.floorAskPrice?.max },
      },
    });
  }

  try {
    const from = params.continuation ? Number(splitContinuation(params.continuation)[0]) : 0;

    const esSearchParams = {
      index: INDEX_NAME,
      query: esQuery,
      sort: [
        params.normalizeRoyalties
          ? {
              "order.pricing.normalizedValueDecimal": {
                order: "asc",
              },
            }
          : {
              "order.pricing.priceDecimal": {
                order: "asc",
              },
            },
        {
          contractAndTokenId: {
            order: "asc",
          },
        },
      ],
      size: params.limit,
      from,
      collapse: {
        field: "contractAndTokenId",
      },
    };

    const esResult = await elasticsearch.search<AskDocument>(esSearchParams);

    logger.info(
      "elasticsearch-asks",
      JSON.stringify({
        topic: "searchTokenAsks",
        message: "Debug result",
        data: {
          esSearchParamsJSON: JSON.stringify(esSearchParams),
        },
      })
    );

    const asks: AskDocument[] = esResult.hits.hits.map((hit) => hit._source!);

    let continuation = null;

    if (esResult.hits.hits.length === params.limit) {
      continuation = buildContinuation(`${params.limit + from}`);
    }

    return { asks, continuation };
  } catch (error) {
    logger.error(
      "elasticsearch-asks",
      JSON.stringify({
        topic: "searchTokenAsks",
        data: {
          params: params,
        },
        error,
      })
    );

    throw error;
  }
};

export const _search = async (
  params: {
    _source?: string[] | undefined;
    query?: QueryDslQueryContainer | undefined;
    sort?: Sort | undefined;
    size?: number | undefined;
    search_after?: SortResults | undefined;
    track_total_hits?: boolean;
  },
  retries = 0,
  debug = false
): Promise<SearchResponse<AskDocument, Record<string, AggregationsAggregate>>> => {
  try {
    params.track_total_hits = params.track_total_hits ?? false;

    const esResult = await elasticsearch.search<AskDocument>({
      index: INDEX_NAME,
      ...params,
    });

    if (retries > 0 || debug) {
      logger.info(
        "elasticsearch-asks",
        JSON.stringify({
          topic: "_search",
          latency: esResult.took,
          paramsJSON: JSON.stringify(params),
          retries,
          esResult: debug ? esResult : undefined,
          params: debug ? params : undefined,
        })
      );
    }

    return esResult;
  } catch (error) {
    const retryableError =
      (error as any).meta?.meta?.aborted ||
      (error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception";

    if (retryableError) {
      logger.warn(
        "elasticsearch-asks",
        JSON.stringify({
          topic: "_search",
          message: "Retrying...",
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
        "elasticsearch-asks",
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
    } else {
      logger.error(
        "elasticsearch-asks",
        JSON.stringify({
          topic: "_search",
          message: "Unexpected error.",
          data: {
            params: JSON.stringify(params),
          },
          error,
          retries,
        })
      );
    }

    throw error;
  }
};

export const updateAsksTokenData = async (
  contract: string,
  tokenId: string,
  tokenData: {
    isFlagged: number;
    isSpam: number;
    rarityRank?: number;
  }
): Promise<boolean> => {
  let keepGoing = false;

  const should: any[] = [
    {
      bool: {
        must_not: [
          {
            term: {
              "token.isFlagged": Boolean(tokenData.isFlagged),
            },
          },
        ],
      },
    },
    {
      bool: {
        must_not: [
          {
            term: {
              "token.isSpam": Number(tokenData.isSpam) > 0,
            },
          },
        ],
      },
    },
    {
      bool: tokenData.rarityRank
        ? {
            must_not: [
              {
                term: {
                  "token.rarityRank": tokenData.rarityRank,
                },
              },
            ],
          }
        : {
            must: [
              {
                exists: {
                  field: "token.rarityRank",
                },
              },
            ],
          },
    },
  ];

  const query = {
    bool: {
      must: [
        {
          term: {
            contractAndTokenId: `${contract}:${tokenId}`,
          },
        },
      ],
      filter: {
        bool: {
          should,
        },
      },
    },
  };

  try {
    const esResult = await _search(
      {
        _source: ["id"],
        // This is needed due to issue with elasticsearch DSL.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        query,
        size: 1000,
      },
      0
    );

    const pendingUpdateDocuments: { id: string; index: string }[] = esResult.hits.hits.map(
      (hit) => ({ id: hit._source!.id, index: hit._index })
    );

    if (pendingUpdateDocuments.length) {
      const bulkParams = {
        body: pendingUpdateDocuments.flatMap((document) => [
          { update: { _index: document.index, _id: document.id, retry_on_conflict: 3 } },
          {
            doc: {
              "token.isFlagged": Boolean(tokenData.isFlagged),
              "token.isSpam": Number(tokenData.isSpam) > 0,
              "token.rarityRank": tokenData.rarityRank,
            },
          },
        ]),
        filter_path: "items.*.error",
      };

      const response = await elasticsearch.bulk(bulkParams, { ignore: [404] });

      if (response?.errors) {
        keepGoing = response?.items.some((item) => item.update?.status !== 400);

        logger.error(
          "elasticsearch-asks",
          JSON.stringify({
            topic: "updateAsksTokenData",
            message: `Errors in response`,
            data: {
              contract,
              tokenId,
              tokenData,
            },
            bulkParams,
            response,
          })
        );
      } else {
        keepGoing = pendingUpdateDocuments.length === 1000;

        logger.info(
          "elasticsearch-asks",
          JSON.stringify({
            topic: "updateAsksTokenData",
            message: `Success`,
            data: {
              contract,
              tokenId,
              tokenData,
            },
            bulkParams,
            response,
            keepGoing,
          })
        );
      }
    }
  } catch (error) {
    const retryableError =
      (error as any).meta?.meta?.aborted ||
      (error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception";

    if (retryableError) {
      logger.warn(
        "elasticsearch-asks",
        JSON.stringify({
          topic: "updateAsksTokenData",
          message: `Unexpected error`,
          data: {
            contract,
            tokenId,
            tokenData,
          },
          error,
        })
      );

      keepGoing = true;
    } else {
      logger.error(
        "elasticsearch-asks",
        JSON.stringify({
          topic: "updateAsksTokenData",
          message: `Unexpected error`,
          data: {
            contract,
            tokenId,
            tokenData,
          },
          error,
        })
      );

      throw error;
    }
  }

  return keepGoing;
};

export const updateAsksCollectionData = async (
  collectionId: string,
  collectionData: {
    isSpam: number;
  }
): Promise<boolean> => {
  let keepGoing = false;

  const should: any[] = [
    {
      bool: {
        must_not: [
          {
            term: {
              "collection.isSpam": Number(collectionData.isSpam) > 0,
            },
          },
        ],
      },
    },
  ];

  const query = {
    bool: {
      must: [
        {
          term: {
            "collection.id": collectionId,
          },
        },
      ],
      filter: {
        bool: {
          should,
        },
      },
    },
  };

  try {
    const esResult = await _search(
      {
        _source: ["id"],
        // This is needed due to issue with elasticsearch DSL.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        query,
        size: 1000,
      },
      0
    );

    const pendingUpdateDocuments: { id: string; index: string }[] = esResult.hits.hits.map(
      (hit) => ({ id: hit._source!.id, index: hit._index })
    );

    if (pendingUpdateDocuments.length) {
      const bulkParams = {
        body: pendingUpdateDocuments.flatMap((document) => [
          { update: { _index: document.index, _id: document.id, retry_on_conflict: 3 } },
          {
            doc: {
              "collection.isSpam": Number(collectionData.isSpam) > 0,
            },
          },
        ]),
        filter_path: "items.*.error",
      };

      const response = await elasticsearch.bulk(bulkParams, { ignore: [404] });

      if (response?.errors) {
        keepGoing = response?.items.some((item) => item.update?.status !== 400);

        logger.error(
          "elasticsearch-asks",
          JSON.stringify({
            topic: "updateAsksCollectionData",
            message: `Errors in response`,
            data: {
              collectionId,
              collectionData,
            },
            bulkParams,
            response,
          })
        );
      } else {
        keepGoing = pendingUpdateDocuments.length === 1000;

        logger.info(
          "elasticsearch-asks",
          JSON.stringify({
            topic: "updateAsksCollectionData",
            message: `Success`,
            data: {
              collectionId,
              collectionData,
            },
            bulkParams,
            response,
            keepGoing,
          })
        );
      }
    }
  } catch (error) {
    const retryableError =
      (error as any).meta?.meta?.aborted ||
      (error as any).meta?.body?.error?.caused_by?.type === "node_not_connected_exception";

    if (retryableError) {
      logger.warn(
        "elasticsearch-asks",
        JSON.stringify({
          topic: "updateAsksCollectionData",
          message: `Unexpected error`,
          data: {
            collectionId,
            collectionData,
          },
          error,
        })
      );

      keepGoing = true;
    } else {
      logger.error(
        "elasticsearch-asks",
        JSON.stringify({
          topic: "updateAsksCollectionData",
          message: `Unexpected error`,
          data: {
            collectionId,
            collectionData,
          },
          error,
        })
      );

      throw error;
    }
  }

  return keepGoing;
};
