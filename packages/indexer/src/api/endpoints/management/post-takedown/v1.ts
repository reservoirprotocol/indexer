/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import _ from "lodash";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex, toBuffer } from "@/common/utils";
import { ApiKeyManager } from "@/models/api-keys";
import { idb } from "@/common/db";

const version = "v1";

export const postTakedownV1Options: RouteOptions = {
  description: "Takedown token or collection",
  notes:
    "This API can be used by allowed API keys to take down a token or collection. This will remove the token or collection from the API and prevent it from being indexed again.",
  tags: ["api", "Management"],
  validate: {
    payload: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Takedown the given token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      collection: Joi.string().description(
        "Takedown the given collection. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
      ),
      key: Joi.string().uuid().description("API key").required(),
      active: Joi.boolean()
        .description("Whether to activate or deactivate the token/collection")
        .default(true),
    }).or("token", "collection"),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postTakedown${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-takedown-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const id = payload.token ? payload.token : payload.collection;
      const type = payload.token ? "token" : "collection";
      const apiKey = await ApiKeyManager.getApiKey(payload.key);

      if (_.isNull(apiKey)) {
        throw Boom.unauthorized("Invalid API key");
      }

      if (!apiKey.permissions?.takedown) {
        throw Boom.unauthorized("Not allowed");
      }

      if (type === "token") {
        await idb.oneOrNone(
          `
            UPDATE "tokens"
            SET "is_takedown" = $/active/
            WHERE "contract" = $/contract/
            AND "token_id" = $/token_id/
          `,
          {
            contract: toBuffer(id.split(":")[0]),
            token_id: id.split(":")[1],
            active: Number(payload.active),
          }
        );
      } else if (type === "collection") {
        await idb.oneOrNone(
          `
            UPDATE "collections"
            SET "is_takedown" = $/active/
            WHERE "id" = $/id/
          `,
          {
            id,
            active: Number(payload.active),
          }
        );
      }

      logger.info(
        `post-takedown-${version}-handler`,
        JSON.stringify({
          message: "Takedown request accepted",
          id,
          type,
          active: payload.active,
          apiKey: apiKey.key,
        })
      );

      return { message: "Takedown request accepted" };
    } catch (error) {
      logger.warn(`post-takedown-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
