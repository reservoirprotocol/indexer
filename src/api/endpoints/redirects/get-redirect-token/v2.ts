/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { Sources } from "@/models/sources";

const version = "v2";

export const getRedirectTokenV2Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "Redirect response to the given source token page",
  tags: ["api", "Redirects"],
  plugins: {
    "hapi-swagger": {
      order: 53,
    },
  },
  validate: {
    params: Joi.object({
      source: Joi.string().required().description("Name of the order source. Example `OpenSea`"),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .required()
        .description(
          "Redirect to the given token page. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
    }),
  },
  handler: async (request: Request, response) => {
    const params = request.params as any;
    const sources = await Sources.getInstance();

    try {
      const source = await sources.getByName(params.source);
      const [contract, tokenId] = params.token.split(":");
      const tokenUrl = sources.getTokenUrl(source, contract, tokenId);

      return response.redirect(tokenUrl);
    } catch (error) {
      logger.error(`get-redirect-token-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
