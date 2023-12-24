/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { blockCheckJob } from "@/jobs/events-sync/block-check-queue-job";

export const postFixBlocksOptions: RouteOptions = {
  description: "Trigger fixing any orphaned block.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      fromBlock: Joi.number().required(),
      toBlock: Joi.number().required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const fromBlock = payload.fromBlock;
      const toBlock = payload.toBlock;

      for (let block = fromBlock; block <= toBlock; block++) {
        await blockCheckJob.addToQueue({ block });
      }

      return { message: "Request triggered" };
    } catch (error) {
      logger.error("post-fix-blocks-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
