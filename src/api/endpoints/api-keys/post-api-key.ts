/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { ApiKeyManager } from "@/entities/api-keys";

export const postApiKey: RouteOptions = {
  description: "Create a new API key.",
  notes:
    "The API key can be used optionally in every route, set it as a request header **x-api-key**.",
  tags: ["api", "5. Misc"],
  plugins: {
    "hapi-swagger": {
      payloadType: "form",
    },
  },
  validate: {
    payload: Joi.object({
      appName: Joi.string().required().description("The name of the app"),
      email: Joi.string()
        .email()
        .required()
        .description("Your e-mail address so we can reach you"),
      website: Joi.string()
        .uri()
        .required()
        .description("The website of your project"),
    }),
  },
  response: {
    schema: Joi.object({
      key: Joi.string().required().uuid(),
    }).label("getNewApiKeyResponse"),
    failAction: (_request, _h, error) => {
      logger.error("post-api-key-handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const manager = new ApiKeyManager();

      const key = await manager.create({
        app_name: payload.appName,
        website: payload.website,
        email: payload.email,
      });

      if (!key) {
        throw new Error("Unable to create a new api key with given values");
      }

      return key;
    } catch (error) {
      logger.error("post-api-key-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
