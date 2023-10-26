/* eslint-disable @typescript-eslint/no-explicit-any */

import { elasticsearch } from "@/common/elasticsearch";
import { logger } from "@/common/logger";

import { getNetworkName, getNetworkSettings } from "@/config/network";

import * as CONFIG from "@/elasticsearch/indexes/asks/config";
import { AskDocument } from "@/elasticsearch/indexes/asks/base";
import { config } from "@/config/index";

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
  if (config.environment !== "dev" && config.chainId !== 1) return;

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

export const deleteAsksById = async (ids: string[]): Promise<void> => {
  try {
    const response = await elasticsearch.bulk({
      body: ids.flatMap((id) => ({ delete: { _index: INDEX_NAME, _id: id } })),
    });

    if (response.errors) {
      logger.warn(
        "elasticsearch-asks",
        JSON.stringify({
          topic: "delete-by-id-conflicts",
          data: {
            ids: JSON.stringify(ids),
          },
          response,
        })
      );
    }
  } catch (error) {
    logger.error(
      "elasticsearch-asks",
      JSON.stringify({
        topic: "delete-by-id-error",
        data: {
          ids: JSON.stringify(ids),
        },
        error,
      })
    );

    throw error;
  }
};
