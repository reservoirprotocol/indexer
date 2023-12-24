/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export const postUpdateImageVersionOptions: RouteOptions = {
  description: "Increment the metadata version for a collection to bust the cache",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Refresh the given token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        )
        .required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const [contract, tokenId] = payload.token.split(":");
      await idb.oneOrNone(
        `
          UPDATE tokens
            SET image_version = NOW(),
                updated_at = NOW()
          WHERE contract = $1 AND token_id = $2
        `,
        [toBuffer(contract), tokenId]
      );
      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-update-image-version-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
