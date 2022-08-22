/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { logger } from "@/common/logger";
import { Tokens } from "@/models/tokens";
import { ApiKeyManager } from "@/models/api-keys";
import * as nonFlaggedTokenSet from "@/jobs/token-updates/non-flagged-token-set";

const version = "v1";

export const postFlagTokenV1Options: RouteOptions = {
  description: "Update token flag status",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    headers: Joi.object({
      "x-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "The token to update the flag status for. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        )
        .required(),
      flag: Joi.number()
        .allow(0, 1)
        .description(`0 - Token is not flagged, 1 - Token is flagged`)
        .required(),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postFlagToken${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-flag-token-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);

    if (_.isNull(apiKey)) {
      throw Boom.unauthorized("Wrong or missing API key");
    }

    const payload = request.payload as any;
    const [contract, tokenId] = payload.token.split(":");

    const token = await Tokens.getByContractAndTokenId(contract, tokenId);
    if (!token) {
      throw Boom.badData(`Token ${payload.token} not found`);
    }

    try {
      const currentUtcTime = new Date().toISOString();

      await Tokens.update(contract, tokenId, {
        isFlagged: payload.flag,
        lastFlagUpdate: currentUtcTime,
      });

      await nonFlaggedTokenSet.addToQueue(contract, token.collectionId);

      logger.info(
        `post-flag-token-${version}-handler`,
        `${apiKey.appName} updated ${payload.token} to ${payload.flag}`
      );
      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-flag-token-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
