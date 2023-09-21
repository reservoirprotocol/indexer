/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";

export const postTriggerJobOptions: RouteOptions = {
  description: "Trigger bullmq job",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      path: Joi.string().allow(""),
      params: Joi.any(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const job = await import(`@/jobs/${payload.path}`);

      job.addToQueue(...payload.params);

      return true;
    } catch (error) {
      logger.error("post-trigger-job-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
