/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { regex } from "@/common/utils";
import { fetchSourceInfoJob } from "@/jobs/sources/fetch-source-info-job";

export const postResyncSourceOptions: RouteOptions = {
  description: "Trigger re-syncing of specific source domain",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      source: Joi.string()
        .pattern(regex.domain)
        .description("The source domain to sync. Example: `reservoir.market`"),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const source = payload.source;
      await fetchSourceInfoJob.addToQueue({ sourceDomain: source });

      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-resync-source-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
