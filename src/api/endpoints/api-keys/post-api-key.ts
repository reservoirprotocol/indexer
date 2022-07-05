/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { ApiKeyManager } from "../../../models/api-keys";

export const postApiKey: RouteOptions = {
  description: "Generate API Key",
  notes:
    "The optional API key can be used in every route, by setting it as a request header **x-api-key**.\n\n<a href='https://docs.reservoir.tools/reference/getting-started'>Learn more</a> about API Keys and Rate Limiting",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      payloadType: "form",
      orders: 13,
    },
  },
  validate: {
    payload: Joi.object({
      appName: Joi.string().required().description("The name of your app"),
      email: Joi.string()
        .email()
        .required()
        .description(
          "An e-mail address where you can be reached, in case of issues, to avoid service disruption"
        ),
      website: Joi.string().uri().required().description("The website of your project"),
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
