/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { RateLimitRules } from "@/models/rate-limit-rules";

export const postCreateRateLimitRuleOptions: RouteOptions = {
  description: "Create rate limit",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      route: Joi.string().description("The route for which the rule is created").required(),
      points: Joi.number().optional(),
      duration: Joi.number().optional(),
      pointsToConsume: Joi.number().optional(),
      tier: Joi.number().default(null).optional(),
      apiKey: Joi.string().default("").uuid().optional(),
      method: Joi.string().valid("get", "post", "delete", "put", "").default("").optional(),
      payload: Joi.array()
        .items(
          Joi.object({
            key: Joi.string(),
            value: Joi.string(),
          })
        )
        .optional(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const rateLimitRule = await RateLimitRules.create(
        payload.route,
        payload.apiKey,
        payload.method,
        payload.tier,
        {
          points: payload.points,
          duration: payload.duration,
          pointsToConsume: payload.pointsToConsume,
        },
        payload.payload || []
      );

      return {
        message: `New rule created ID ${rateLimitRule.id}`,
        rateLimitRule,
      };
    } catch (error) {
      logger.error("post-create-api-key-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
