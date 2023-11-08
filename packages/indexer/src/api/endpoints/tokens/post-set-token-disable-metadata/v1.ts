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
      tokens: Joi.alternatives()
        .try(
          Joi.array()
            .max(50)
            .items(Joi.string().lowercase().pattern(regex.token))
            .description(
              "Array of tokens to disable or reenable metadata for. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
            ),
          Joi.string()
            .lowercase()
            .pattern(regex.token)
            .description(
              "Array of tokens to disable or reenable metadata for. Max limit is 50. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
            )
        )
        .required(),
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

    const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);

    if (_.isNull(apiKey)) {
      throw Boom.unauthorized("Invalid API key");
    }

    if (!apiKey.permissions?.update_metadata_disabled) {
      throw Boom.unauthorized("Not allowed");
    }

    if (!_.isArray(payload.tokens)) {
      payload.tokens = [payload.tokens];
    }

    payload.disable = Number(payload.disable);

    const conditions: string[] = [];
    for (let i = 0; i < payload.tokens.length; i++) {
      const [contract, tokenId] = payload.tokens[i].split(":");
      payload[`tokenContract${i}`] = toBuffer(contract);
      payload[`tokenId${i}`] = tokenId;

      conditions.push(`"contract" = $/tokenContract${i}/ AND "token_id" = $/tokenId${i}/`);
    }

    try {
      await idb.oneOrNone(
        `
          UPDATE "tokens"
          SET "metadata_disabled" = $/disable/
          WHERE ${conditions.map((c) => `(${c})`).join(" OR ")}
        `,
        payload
      );

      logger.info(
        `post-set-token-disable-metadata-${version}-handler`,
        JSON.stringify({
          message: "Disable metadata request accepted",
          ids: payload.tokens,
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
