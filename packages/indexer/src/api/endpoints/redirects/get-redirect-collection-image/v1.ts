/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import * as Boom from "@hapi/boom";

import { Collections } from "@/models/collections";
import { regex } from "@/common/utils";
import { Assets } from "@/utils/assets";

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
        .pattern(regex.collectionId)
        .required()
        .description(
          "Redirect to the given collection image. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
    query: Joi.object({}).options({ allowUnknown: true, stripUnknown: false }),
  },
  handler: async (request: Request, response) => {
    const params = request.params as any;

    const collection = await Collections.getById(params.collection, true);

    if (_.isNull(collection) || _.isNull(collection.metadata?.imageUrl)) {
      throw Boom.badData(`Collection ${params.collection} not found`);
    }

    const imageWithQueryParams = Assets.addImageParams(
      collection.metadata.imageUrl ?? "",
      request.query
    );

    return response
      .redirect(imageWithQueryParams)
      .header("cache-control", `max-age=60, must-revalidate, public`);
  },
};
