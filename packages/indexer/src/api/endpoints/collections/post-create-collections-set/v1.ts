/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { CollectionSets } from "@/models/collection-sets";

const version = "v1";

export const postCreateCollectionsSetV1Options: RouteOptions = {
  description: "Create collection set",
  notes:
    'Array of collections to gather in a set. Adding or removing a collection will change the response. You may use this set when `collectionSetId` is an available param. The max limit of collection in an array is 500. An example is below.\n\n`"collections": "0xba30E5F9Bb24caa003E9f2f0497Ad287FDF95623", "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D"`\n\n`"collectionsSetId": "8daa732ebe5db23f267e58d52f1c9b1879279bcdf4f78b8fb563390e6946ea65"`',
  tags: ["api", "Collections"],
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
        .min(1)
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
