/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { CollectionSets } from "@/models/collection-sets";

const version = "v1";

export const postCreateCollectionsSetV1Options: RouteOptions = {
  description: "Create a collection set",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    payload: Joi.object({
      collections: Joi.array()
        .items(
          Joi.string()
            .lowercase()
            .description(
              "Array of collections to gather in a set. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            )
        )
        .max(500)
        .required(),
    }),
  },
  response: {
    schema: Joi.object({
      collectionsSetId: Joi.string(),
    }).label(`postCreateCollectionsSet${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `post-create-collections-set-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const collectionsSetId = await CollectionSets.add(payload.collections);
      return { collectionsSetId };
    } catch (error) {
      logger.error(`post-create-collections-set-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
