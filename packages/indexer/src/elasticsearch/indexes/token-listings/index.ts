/* eslint-disable @typescript-eslint/no-explicit-any */

import { elasticsearch } from "@/common/elasticsearch";
import { logger } from "@/common/logger";

import { getNetworkName, getNetworkSettings } from "@/config/network";

import * as CONFIG from "@/elasticsearch/indexes/token-listings/config";
import { TokenListingDocument } from "@/elasticsearch/indexes/token-listings/base";

const INDEX_NAME = `${getNetworkName()}.token-listings`;

export const save = async (tokenListings: TokenListingDocument[], upsert = true): Promise<void> => {
  try {
    const response = await elasticsearch.bulk({
      body: tokenListings.flatMap((tokenListing) => [
        { [upsert ? "index" : "create"]: { _index: INDEX_NAME, _id: tokenListing.id } },
        tokenListing,
      ]),
    });

    if (response.errors) {
      if (upsert) {
        logger.error(
          "elasticsearch-token-listings",
          JSON.stringify({
            topic: "save-errors",
            upsert,
            data: {
              tokenListings: JSON.stringify(tokenListings),
            },
            response,
          })
        );
      } else {
        logger.debug(
          "elasticsearch-token-listings",
          JSON.stringify({
            topic: "save-conflicts",
            upsert,
            data: {
              tokenListings: JSON.stringify(tokenListings),
            },
            response,
          })
        );
      }
    }
  } catch (error) {
    logger.error(
      "elasticsearch-token-listings",
      JSON.stringify({
        topic: "save",
        upsert,
        data: {
          tokenListings: JSON.stringify(tokenListings),
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
      getNetworkSettings().elasticsearch?.indexes?.tokenListings?.configName ?? "CONFIG_DEFAULT";

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const indexConfig = CONFIG[indexConfigName];

    if (await elasticsearch.indices.exists({ index: INDEX_NAME })) {
      logger.info(
        "elasticsearch-token-listings",
        JSON.stringify({
          topic: "initIndex",
          message: "Index already exists.",
          indexName: INDEX_NAME,
          indexConfig,
        })
      );

      if (getNetworkSettings().elasticsearch?.indexes?.tokenListings?.disableMappingsUpdate) {
        logger.info(
          "elasticsearch-token-listings",
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
        "elasticsearch-token-listings",
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
        "elasticsearch-token-listings",
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
        "elasticsearch-token-listings",
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
      "elasticsearch-token-listings",
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
