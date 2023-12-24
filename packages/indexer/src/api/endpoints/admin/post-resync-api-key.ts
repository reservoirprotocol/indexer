/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { syncApiKeysJob } from "@/jobs/api-keys/sync-api-keys-job";

export const postResyncApiKey: RouteOptions = {
  description: "Trigger a resync from mainnet to all other chains of the given api key.",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      apiKey: Joi.string().description("The api key to resync"),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    if (config.chainId !== 1) {
      throw Boom.badRequest("This API can be called only on mainnet");
    }

    const payload = request.payload as any;

    try {
      await syncApiKeysJob.addToQueue({ apiKey: payload.apiKey });
      return { message: `Resync triggered for ${payload.apiKey}` };
    } catch (error) {
      logger.error("post-resync-api-key", `Handler failure: ${error}`);
      throw error;
    }
  },
};
