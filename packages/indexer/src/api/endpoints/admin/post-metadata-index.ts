/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { now, regex } from "@/common/utils";
import { config } from "@/config/index";
import { mintQueueJob } from "@/jobs/token-updates/mint-queue-job";

export const postMetadataIndexOptions: RouteOptions = {
  description: "Trigger metadata indexing for a token's collection",
  tags: ["api", "x-admin"],
  timeout: {
    server: 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      token: Joi.string().pattern(regex.token).required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const token = payload.token;

      const [contract, tokenId] = token.split(":");

      await mintQueueJob.addToQueue([{ contract, tokenId, mintedTimestamp: now() }]);

      return { message: "Success" };
    } catch (error) {
      logger.error("post-metadata-index-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
