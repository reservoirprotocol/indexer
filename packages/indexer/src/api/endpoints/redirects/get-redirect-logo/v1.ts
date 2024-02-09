/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { Sources } from "@/models/sources";

const version = "v1";

export const getRedirectLogoV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "Redirect response to the given source logo",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 53,
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      source: Joi.string().required(),
    }),
  },
  handler: async (request: Request, response) => {
    const query = request.query as any;
    const sources = await Sources.getInstance();

    try {
      let source = sources.getByName(query.source, false);
      if (!source) {
        source = sources.getByDomain(query.source);
      }

      return response.redirect(source?.getIcon()).header("cache-control", `max-age=60, must-revalidate, public`);
    } catch (error) {
      logger.error(`get-redirect-logo-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
