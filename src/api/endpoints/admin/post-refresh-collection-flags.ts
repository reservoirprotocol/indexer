/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { regex } from "@/common/utils";

import * as syncCollectionFlagStatus from "@/jobs/token-updates/sync-collection-flag-status";

export const postRefreshCollectionFlagsOptions: RouteOptions = {
  description: "Refresh tokens flag status for the given collection",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Refresh tokens for the given collection. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        )
        .required(),
      backfill: Joi.boolean().default(false),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      await syncCollectionFlagStatus.addToQueue(payload.collection, payload.backfill);
      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-refresh-collection-flags-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
