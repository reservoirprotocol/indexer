import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { ApiKeyManager } from "@/entities/apikeys/api-key";

export const postApiKey: RouteOptions = {
  description: "Create a new API key",
  notes:
    "The API key can be used optionally in every route, set it as a request header **x-api-key**",
  tags: ["api", "apikeys"],
  plugins: {
    "hapi-swagger": {
      payloadType: "form",
    },
  },
  validate: {
    payload: Joi.object({
      name: Joi.string().required().description("The name of the app"),
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
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload: any = request.payload;
    const manager = new ApiKeyManager();

    const key: any = await manager.create({
      name: payload.name,
      website: payload.website,
      email: payload.email,
    });

    if (!key) {
      throw new Error(`Unable to create a new api key with given values`);
    }

    return key;
  },
};
