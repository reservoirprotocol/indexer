/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { logger } from "@/common/logger";
import * as Boom from "@hapi/boom";
import { ApiKeyManager } from "@/models/api-keys";
import _ from "lodash";
import { idb } from "@/common/db";
import { regex, toBuffer } from "@/common/utils";

const version = "v1";

export const postSetTokenDisableMetadataV1Options: RouteOptions = {
  description: "Disable or reenable metadata for a token",
  notes:
    "This API requires an allowed API key for execution. Please contact technical support with more questions.",
  tags: ["api"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    headers: Joi.object({
      "x-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    params: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .required()
        .description(
          "Disable or reenable metadata for a particular token, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`. Requires an authorized api key to be passed."
        ),
    }),
    payload: Joi.object({
      disable: Joi.boolean()
        .description("Whether to disable or reenable the metadata. Defaults to true (disable)")
        .default(true),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postSetTokenDisableMetadata${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `post-set-token-disable-metadata-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;
    const params = request.params as any;

    const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);

    if (_.isNull(apiKey)) {
      throw Boom.unauthorized("Invalid API key");
    }

    if (!apiKey.permissions?.update_metadata_disabled) {
      throw Boom.unauthorized("Not allowed");
    }

    try {
      await idb.oneOrNone(
        `
          UPDATE "tokens"
          SET "metadata_disabled" = $/disable/
          WHERE "contract" = $/contract/
          AND "token_id" = $/token_id/
        `,
        {
          contract: toBuffer(params.token.split(":")[0]),
          token_id: params.token.split(":")[1],
          disable: Number(payload.disable),
        }
      );

      logger.info(
        `post-set-token-disable-metadata-${version}-handler`,
        JSON.stringify({
          message: "Disable token metadata request accepted",
          id: payload.token,
          type: "token",
          disable: payload.disable,
          apiKey: apiKey.key,
        })
      );

      return { message: "Success" };
    } catch (error) {
      logger.error(
        `post-set-token-disable-metadata-${version}-handler`,
        `Handler failure: ${JSON.stringify(error)}`
      );
      throw error;
    }
  },
};
