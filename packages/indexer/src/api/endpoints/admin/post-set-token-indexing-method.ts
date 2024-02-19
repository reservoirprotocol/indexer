/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";

export const postSetTokenIndexingMethodOptions: RouteOptions = {
  description: "Set the tokens indexing method for all tokens in certain collection",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      method: Joi.string().required().valid("opensea", "simplehash", null),
      collection: Joi.string()
        .lowercase()
        .description("Collection to update. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`")
        .required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const collection = await Collections.getById(payload.collection);

      if (!collection) {
        throw Boom.badRequest(`Collection ${payload.collection} not found`);
      }

      await Collections.update(collection.id, { tokenIndexingMethod: payload.method });

      return {
        message: `Update collection ${payload.collection} indexing method to ${payload.method}`,
      };
    } catch (error) {
      logger.error(`post-set-token-indexing-method-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
