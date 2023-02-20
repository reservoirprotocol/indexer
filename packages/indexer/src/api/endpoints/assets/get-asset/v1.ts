/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { decrypt } from "@/common/utils";
import * as Boom from "@hapi/boom";

const version = "v1";

export const getAssetV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 1000 * 60 * 60 * 24 * 30,
  },
  description: "Return the asset based on the given param",
  tags: ["api", "x-admin"],
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  validate: {
    query: Joi.object({
      asset: Joi.string().required(),
    }),
  },
  handler: async (request: Request, response) => {
    const query = request.query as any;

    try {
      return response
        .redirect(decrypt(query.asset))
        .header("cache-control", `${1000 * 60 * 60 * 24 * 30}`);
    } catch (error) {
      logger.error(
        `get-asset-${version}-handler`,
        `Asset: ${query.asset} Handler failure: ${error}`
      );

      const err = Boom.notFound(`Asset not found`);
      err.output.headers["cache-control"] = `${1000 * 60 * 60 * 24}`;
      throw err;
    }
  },
};
