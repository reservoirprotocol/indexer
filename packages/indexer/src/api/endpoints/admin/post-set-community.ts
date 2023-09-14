/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";
import { setCommunityQueueJob } from "@/jobs/collection-updates/set-community-queue-job";

export const postSetCollectionCommunity: RouteOptions = {
  description: "Set a community for a specific collection",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string()
        .lowercase()
        .required()
        .description(
          "Update community for a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      community: Joi.string().lowercase().required().allow(""),
      doRetries: Joi.boolean().default(false),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const collection = payload.collection;
      const community = payload.community;

      // Check if the collection exist
      const collectionData = await Collections.getById(collection);

      if (collectionData) {
        // If we have the collection update it
        await Collections.update(collection, { community });
        logger.info(
          "post-set-community-handler",
          `Setting community ${community} to collection ${collection}`
        );
      } else if (payload.doRetries) {
        // We currently don't have the collection but might have in the future trigger a delayed job
        await setCommunityQueueJob.addToQueue({ collection, community });
      }

      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-set-community-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
