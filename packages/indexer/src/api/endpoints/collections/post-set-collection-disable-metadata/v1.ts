/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import * as Boom from "@hapi/boom";
import { ApiKeyManager } from "@/models/api-keys";
import _ from "lodash";
import { idb } from "@/common/db";
import { MetadataStatus } from "@/models/metadata-status";

const version = "v1";

export const postSetCollectionDisableMetadataV1Options: RouteOptions = {
  description: "Disable or reenable metadata for a collection",
  notes:
    "This API requires an allowed API key for execution. Please contact technical support with more questions.",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    headers: Joi.object({
      "x-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collections: Joi.alternatives()
        .try(
          Joi.array()
            .max(50)
            .items(Joi.string().lowercase())
            .description(
              "Array of collection ids to disable metadata for. Max limit is 50. Example: `collections[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63 collections[1]: 0x521f9c7505005cfa19a8e5786a9c3c9c9f5e6f42`"
            ),
          Joi.string()
            .lowercase()
            .description(
              "Array of collection ids to disable metadata for. Max limit is 50. Example: `collections[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63 collections[1]: 0x521f9c7505005cfa19a8e5786a9c3c9c9f5e6f42`"
            )
        )
        .required(),
      disable: Joi.boolean()
        .description("Whether to disable or reenable the metadata. Defaults to true (disable)")
        .default(true),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postSetCollectionDisableMetadata${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `post-set-collection-disable-metadata-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);

    if (_.isNull(apiKey)) {
      throw Boom.unauthorized("Invalid API key");
    }

    if (!apiKey.permissions?.update_metadata_disabled) {
      throw Boom.unauthorized("Not allowed");
    }

    if (!_.isArray(payload.collections)) {
      payload.collections = [payload.collections];
    }

    try {
      await idb.oneOrNone(
        `
          UPDATE "collections"
          SET "metadata_disabled" = $/disable/
          WHERE "id" IN ($/collections:csv/)
        `,
        {
          collections: payload.collections,
          disable: Number(payload.disable),
        }
      );

      if (payload.disable) {
        MetadataStatus.disable(payload.collections);
      } else {
        MetadataStatus.enable(payload.collections);
      }

      logger.info(
        `post-set-collection-disable-metadata-${version}-handler`,
        JSON.stringify({
          message: "Disable metadata request accepted",
          ids: payload.collections,
          type: "collection",
          disable: payload.disable,
          apiKey: apiKey.key,
        })
      );

      return { message: "Success" };
    } catch (error) {
      logger.error(
        `post-set-collection-disable-metadata${version}-handler`,
        `Handler failure: ${JSON.stringify(error)}`
      );
      throw error;
    }
  },
};
