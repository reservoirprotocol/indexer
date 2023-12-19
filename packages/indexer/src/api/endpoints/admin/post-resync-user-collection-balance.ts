import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { resyncUserCollectionsJob } from "@/jobs/nft-balance-updates/reynsc-user-collections-job";

export const postResyncUserCollectionBalance: RouteOptions = {
  description: "Trigger the recalculation of user in certain collection",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      user: Joi.string().lowercase().required(),
      collection: Joi.string().lowercase(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      await resyncUserCollectionsJob.addToQueue([
        {
          user: payload.user,
          collectionId: payload.collection,
        },
      ]);

      return {
        message: `Triggered balance resync for user ${payload.user}${
          payload.collection ? ` in collection ${payload.collection}` : ""
        }`,
      };
    } catch (error) {
      logger.error("post-resync-user-collection-balance", `Handler failure: ${error}`);
      throw error;
    }
  },
};
