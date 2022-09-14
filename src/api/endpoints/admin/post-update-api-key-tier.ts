/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";

export const postUpdateApiKeyTierOptions: RouteOptions = {
  description: "Update the tier for the giver api key",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      apiKey: Joi.string().description("The api key to update"),
      tier: Joi.number().valid(0, 1, 2, 3).required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      await ApiKeyManager.update(payload.apiKey, { tier: payload.tier });

      return {
        message: `Api Key ${payload.apiKey} was updated with tier=${payload.tier}`,
      };
    } catch (error) {
      logger.error("post-update-api-key-tier-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
