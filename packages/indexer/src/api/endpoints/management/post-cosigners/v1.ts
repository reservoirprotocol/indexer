import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { logger } from "@/common/logger";
import { ApiKeyManager } from "@/models/api-keys";
import * as externalCosign from "@/utils/offchain-cancel/external-cosign";

const version = "v1";

export const postCosignersV1Options: RouteOptions = {
  description: "Create or update an external cosigner",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    payload: Joi.object({
      signer: Joi.string().lowercase().required(),
      endpoint: Joi.string().required(),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postCosigners${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-cosigners-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);
    if (_.isNull(apiKey)) {
      throw Boom.unauthorized("Invalid API key");
    }

    try {
      await externalCosign.upsertExternalCosigner(payload, apiKey.key);
      return { message: "Success" };
    } catch (error) {
      logger.error(`post-cosigners-${version}-handler`, `Handler failure: ${error}`);
      return { message: "Failure" };
    }
  },
};
