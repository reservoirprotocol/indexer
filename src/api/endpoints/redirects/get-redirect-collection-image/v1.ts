/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { Collections } from "@/models/collections";
import * as Boom from "@hapi/boom";

const version = "v1";

export const getRedirectCollectionImageV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "Redirect to the given collection image",
  tags: ["api", "Redirects"],
  plugins: {
    "hapi-swagger": {
      order: 53,
    },
  },
  validate: {
    params: Joi.object({
      collection: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .description(
          "Redirect to the given collection image. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
  },
  handler: async (request: Request, response) => {
    const params = request.params as any;
    try {
      const collection = await Collections.getById(params.collection, true);

      if (_.isNull(collection)) {
        throw Boom.badData(`Collection ${params.collection} not found`);
      }

      return response.redirect(collection.metadata.imageUrl);
    } catch (error) {
      logger.error(`get-redirect-collection-image-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
