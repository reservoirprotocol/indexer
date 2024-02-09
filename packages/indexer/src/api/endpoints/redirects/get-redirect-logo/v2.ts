/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { Sources } from "@/models/sources";

const version = "v2";

export const getRedirectLogoV2Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "Redirect response to the given source logo",
  tags: ["api", "Redirects"],
  plugins: {
    "hapi-swagger": {
      order: 53,
    },
  },
  validate: {
    params: Joi.object({
      source: Joi.string().required().description("Domain of the source. Example `opensea.io`"),
    }),
  },
  handler: async (request: Request, response) => {
    const params = request.params as any;
    const sources = await Sources.getInstance();

    try {
      let source = sources.getByName(params.source, false);
      if (!source) {
        source = sources.getByDomain(params.source);
      }

      return response.redirect(source?.getIcon()).header("cache-control", `max-age=60, must-revalidate, public`);
    } catch (error) {
      logger.error(`get-redirect-logo-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
