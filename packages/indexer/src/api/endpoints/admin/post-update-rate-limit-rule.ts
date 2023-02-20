/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { RateLimitRules } from "@/models/rate-limit-rules";

export const postUpdateRateLimitRuleOptions: RouteOptions = {
  description: "Update the rate limit for the given ID",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      ruleId: Joi.number().description("The rule ID to update").required(),
      tier: Joi.number().valid(0, 1, 2, 3, 4, null).optional(),
      points: Joi.number().optional(),
      duration: Joi.number().optional(),
      apiKey: Joi.string().uuid().optional().allow(""),
      method: Joi.string().valid("get", "post", "delete", "put", "").optional(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      await RateLimitRules.update(payload.ruleId, {
        tier: payload.tier,
        method: payload.method,
        apiKey: payload.apiKey,
        options: {
          points: payload.points,
          duration: payload.duration,
        },
      });

      return {
        message: `Rule ID ${payload.ruleId} was updated with params=${JSON.stringify(payload)}`,
      };
    } catch (error) {
      logger.error("post-update-rate-limit-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
