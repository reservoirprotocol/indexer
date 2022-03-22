/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";

export const postMetadataIndexOptions: RouteOptions = {
  description: "Trigger metadata indexing for collection.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      method: Joi.string().valid("opensea", "rarible").default("rarible"),
      collection: Joi.string().required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const method = payload.method;
      const collection = payload.collection;

      // Make sure the collection exists.
      const result = await idb.oneOrNone(
        `
          SELECT
            collections.id
          FROM collections
          WHERE collections.id = $/collection/
        `,
        { collection }
      );
      if (!result?.id) {
        throw Boom.badRequest("Unknown collection");
      }

      // Queue the collection for indexing.
      await metadataIndexFetch.addToQueue(
        [{ kind: "full-collection", data: { method, collection } }],
        true
      );

      // Mark the collection as requiring metadata indexing.
      await idb.none(
        `
          UPDATE collections SET index_metadata = TRUE
          WHERE collections.id = $/collection/
            AND collections.index_metadata IS DISTINCT FROM TRUE
        `,
        { collection }
      );

      return { message: "Success" };
    } catch (error) {
      logger.error("post-metadata-index-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
