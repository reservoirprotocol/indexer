/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";

export const getApiKeyDetails: RouteOptions = {
  description: "Get the associated info for the given API key",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    params: Joi.object({
      key: Joi.string().description("The API key"),
    }),
  },
  response: {
    schema: Joi.object({
      key: Joi.string().uuid(),
      appName: Joi.string(),
      website: Joi.string(),
      email: Joi.string().email(),
      active: Joi.bool(),
      tier: Joi.number().unsafe(),
      permissions: Joi.string().allow(null),
      createdAt: Joi.string(),
    }).label("getApiKeyRateLimitsResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get-api-key-details-handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const params = request.params as any;

    try {
      const apiKey = await ApiKeyManager.getApiKey(params.key);

      if (!apiKey) {
        throw new Error("Could not find API key");
      }

      return {
        key: apiKey.key,
        appName: apiKey.appName,
        website: apiKey.website,
        email: apiKey.email,
        active: apiKey.active,
        tier: apiKey.tier,
        permissions: apiKey.permissions,
        createdAt: new Date(apiKey.createdAt).toISOString(),
      };
    } catch (error) {
      logger.error("get-api-key-details-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
