/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";
import { regex } from "@/common/utils";

export const postUpdateApiKeyOptions: RouteOptions = {
  description: "Update the given api key",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      apiKey: Joi.string().description("The api key to update"),
      tier: Joi.number().optional(),
      active: Joi.boolean().optional(),
      ips: Joi.array().items(Joi.string().lowercase().pattern(regex.ipv4)).optional(),
      origins: Joi.array().items(Joi.string().lowercase().pattern(regex.origin)).optional(),
      permissions: Joi.object({
        override_collection_refresh_cool_down: Joi.boolean().optional(),
        assign_collection_to_community: Joi.boolean().optional(),
        update_metadata_disabled: Joi.boolean().optional(),
        update_spam_status: Joi.boolean().optional(),
        entity_data_override: Joi.boolean().optional(),
      }).optional(),
      revShareBps: Joi.number().allow(null).optional(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      await ApiKeyManager.update(payload.apiKey, {
        tier: payload.tier,
        active: payload.active,
        ips: payload.ips,
        origins: payload.origins,
        revShareBps: payload.revShareBps,
        permissions: payload.permissions,
      });

      return {
        message: `Api Key ${payload.apiKey} was updated with ${JSON.stringify(payload)}`,
      };
    } catch (error) {
      logger.error("post-update-api-key-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
