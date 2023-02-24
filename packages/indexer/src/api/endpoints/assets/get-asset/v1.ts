/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { logger } from "@/common/logger";
import { decrypt } from "@/common/utils";
import * as Boom from "@hapi/boom";
import { Assets } from "@/utils/assets";

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
    }).options({ allowUnknown: true, stripUnknown: false }),
  },
  handler: async (request: Request, response) => {
    const query = request.query as any;
    const decryptedAsset = decrypt(query.asset);
    const imageWithQueryParams = Assets.addImageParams(
      decryptedAsset,
      _.omit(request.query, ["asset"])
    );
    try {
      return response
        .redirect(imageWithQueryParams)
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
