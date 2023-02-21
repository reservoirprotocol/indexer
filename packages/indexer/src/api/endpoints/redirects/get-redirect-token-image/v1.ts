/* eslint-disable @typescript-eslint/no-explicit-any */

import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { Tokens } from "@/models/tokens";
import * as Boom from "@hapi/boom";
import { Assets } from "@/utils/assets";

const version = "v1";

export const getRedirectTokenImageV1Options: RouteOptions = {
  cache: {
    privacy: "public",
    expiresIn: 60000,
  },
  description: "Redirect response to the given token image",
  tags: ["api", "Redirects"],
  plugins: {
    "hapi-swagger": {
      order: 53,
    },
  },
  validate: {
    params: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .required()
        .description(
          "Redirect to the given token image. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
    }),
    query: Joi.object({}).options({ allowUnknown: true, stripUnknown: false }),
  },
  handler: async (request: Request, response) => {
    const params = request.params as any;

    try {
      const [contract, tokenId] = params.token.split(":");
      const token = await Tokens.getByContractAndTokenId(contract, tokenId, true);

      if (_.isNull(token)) {
        throw Boom.badData(`Token ${params.token} not found`);
      }
      const imageWithQueryParams = Assets.addImageParams(token.image, request.query);
      return response.redirect(imageWithQueryParams).header("cache-control", `${1000 * 60}`);
    } catch (error) {
      logger.error(`get-redirect-token-image-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
