/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { RateLimitRules } from "@/models/rate-limit-rules";

export const postDeleteRateLimitRuleOptions: RouteOptions = {
  description: "Delete the rate limit with the given ID",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      ruleId: Joi.number().description("The rule ID to delete").required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      await RateLimitRules.delete(payload.ruleId);

      return {
        message: `Rule ID ${payload.ruleId} was deleted`,
      };
    } catch (error) {
      logger.error("post-delete-rate-limit-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
