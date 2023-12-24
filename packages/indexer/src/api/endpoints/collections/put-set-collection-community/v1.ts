/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import * as Boom from "@hapi/boom";
import { Collections } from "@/models/collections";
import { ApiKeyManager } from "@/models/api-keys";
import _ from "lodash";

const version = "v1";

export const putSetCollectionCommunityV1Options: RouteOptions = {
  description: "Set a community for a specific collection",
  notes:
    "This API requires an administrator API for execution. Explore and try the `/collections-sets/v1` or `/contracts-sets/v1` endpoints. Please contact technical support with more questions.",
  tags: ["api", "x-admin"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    headers: Joi.object({
      "x-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    params: Joi.object({
      collection: Joi.string()
        .lowercase()
        .required()
        .description(
          "Update community for a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`. Requires an authorized api key to be passed."
        ),
    }),
    payload: Joi.object({
      community: Joi.string().lowercase().required().allow(""),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`putSetCollectionCommunity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `put-set-collection-community-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;
    const params = request.params as any;

    const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);

    if (_.isNull(apiKey)) {
      throw Boom.unauthorized("Invalid API key");
    }

    try {
      if (payload.community === "") {
        const collection = await Collections.getById(params.collection);

        // If no collection found
        if (_.isNull(collection)) {
          throw Boom.badRequest(`Collection ${params.collection} not found`);
        }

        if (apiKey.permissions?.assign_collection_to_community != collection.community) {
          throw Boom.unauthorized("Not allowed");
        }
      } else if (apiKey.permissions?.assign_collection_to_community != payload.community) {
        throw Boom.unauthorized("Not allowed");
      }

      await Collections.update(params.collection, { community: payload.community });

      return { message: "Success" };
    } catch (error) {
      logger.error(
        `put-set-collection-community-${version}-handler`,
        `Handler failure: ${JSON.stringify(error)}`
      );
      throw error;
    }
  },
};
