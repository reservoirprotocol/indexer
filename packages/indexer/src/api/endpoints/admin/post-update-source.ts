/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { regex } from "@/common/utils";

export const postUpdateSourceOptions: RouteOptions = {
  description: "Trigger re-syncing of specific source domain",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      source: Joi.string()
        .pattern(regex.domain)
        .description("The source domain to sync. Example: `reservoir.market`"),
      icon: Joi.string().allow(""),
      title: Joi.string().allow(""),
      allowedApiKeys: Joi.array().items(Joi.string()),
      optimized: Joi.boolean(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const sources = await Sources.getInstance();
      await sources.update(
        payload.source,
        {
          adminTitle: payload.title,
          adminIcon: payload.icon,
          allowedApiKeys: payload.allowedApiKeys,
        },
        payload.optimized
      );

      return {
        message: `Source ${payload.source} was updated with title=${payload.title}, icon=${payload.icon}`,
      };
    } catch (error) {
      logger.error("post-update-source-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
