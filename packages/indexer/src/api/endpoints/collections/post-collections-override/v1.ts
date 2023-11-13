/* eslint-disable @typescript-eslint/no-explicit-any */
import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { CollectionsOverride } from "@/models/collections-override";
import { ApiKeyManager } from "@/models/api-keys";
import * as Boom from "@hapi/boom";

const version = "v1";

export const postCollectionsOverrideV1Options: RouteOptions = {
  description: "Override collections metadata and royalties",
  notes: "Override collections metadata and royalties",
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 31,
      deprecated: true,
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
          "The collection id to update. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
    payload: Joi.object({
      name: Joi.string().allow(null).optional(),
      description: Joi.string().allow(null).optional(),
      imageUrl: Joi.string().allow(null).optional(),
      twitterUrl: Joi.string().allow(null).optional(),
      discordUrl: Joi.string().allow(null).optional(),
      externalUrl: Joi.string().allow(null).optional(),
      royalties: Joi.array()
        .items(
          Joi.object({
            bps: Joi.number(),
            recipient: Joi.string().lowercase(),
          })
        )
        .allow(null)
        .optional(),
    })
      .min(1)
      .description(
        "Params that can be passed in order to override existing ones, to disable override pass null"
      ),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postCollectionsOverride${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `post-collections-override-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;
    const payload = request.payload as any;

    const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);

    if (_.isNull(apiKey)) {
      throw Boom.unauthorized("Invalid API key");
    }

    if (!apiKey.permissions?.entity_data_override) {
      throw Boom.unauthorized("Not allowed");
    }

    try {
      await CollectionsOverride.upsert(
        params.collection,
        {
          name: payload.name,
          description: payload.description,
          imageUrl: payload.imageUrl,
          twitterUrl: payload.twitterUrl,
          discordUrl: payload.discordUrl,
          externalUrl: payload.externalUrl,
        },
        payload.royalties
      );

      return { message: `collection ${params.collection} updated with ${JSON.stringify(payload)}` };
    } catch (error) {
      logger.error(`post-collections-override-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
