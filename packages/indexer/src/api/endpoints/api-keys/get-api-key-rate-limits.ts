/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";
import { logger } from "@/common/logger";
import { RateLimitRules } from "@/models/rate-limit-rules";

export const getApuKeyRateLimits: RouteOptions = {
  description: "Get rate limits for the given API key",
  notes: "Get the rate limits for the given API key",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      payloadType: "form",
      orders: 13,
    },
  },
  validate: {
    params: Joi.object({
      key: Joi.string().uuid().description("The API key"),
    }),
  },
  response: {
    schema: Joi.object({
      rateLimits: Joi.array().items(
        Joi.object({
          route: Joi.string(),
          method: Joi.string().allow(""),
          allowedRequests: Joi.number(),
          perSeconds: Joi.number(),
          payload: Joi.array().items(Joi.object()),
        })
      ),
    }).label("getApiKeyRateLimitsResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get-api-key-rate-limit-handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const params = request.params as any;

    try {
      let rules = await RateLimitRules.getApiKeyRateLimits(params.key);
      rules = _.filter(rules, (rule) => rule.route !== "/livez");

      return {
        rateLimits: _.map(rules, (rule) => ({
          route: rule.route,
          method: rule.method,
          allowedRequests: rule.options.points,
          perSeconds: rule.options.duration,
          payload: rule.payload,
        })),
      };
    } catch (error) {
      logger.error("get-api-key-rate-limit-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
