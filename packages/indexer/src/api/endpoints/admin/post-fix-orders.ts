/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import { orderFixesJob } from "@/jobs/order-fixes/order-fixes-job";

export const postFixOrdersOptions: RouteOptions = {
  description: "Trigger fixing any order inconsistencies.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      by: Joi.string().valid("id", "maker", "token", "contract").required(),
      id: Joi.string().when("by", {
        is: "id",
        then: Joi.required(),
        otherwise: Joi.forbidden(),
      }),
      token: Joi.string().lowercase().pattern(regex.token).when("by", {
        is: "token",
        then: Joi.required(),
        otherwise: Joi.forbidden(),
      }),
      maker: Joi.string().lowercase().pattern(regex.address).when("by", {
        is: "maker",
        then: Joi.required(),
        otherwise: Joi.forbidden(),
      }),
      contract: Joi.string().lowercase().pattern(regex.address).when("by", {
        is: "contract",
        then: Joi.required(),
        otherwise: Joi.forbidden(),
      }),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const by = payload.by;

      if (by === "id") {
        await orderFixesJob.addToQueue([{ by, data: { id: payload.id } }]);
      } else if (by === "maker") {
        await orderFixesJob.addToQueue([{ by, data: { maker: payload.maker } }]);
      } else if (by === "contract") {
        await orderFixesJob.addToQueue([{ by, data: { contract: payload.contract } }]);
      } else if (by === "token") {
        await orderFixesJob.addToQueue([{ by, data: { token: payload.token } }]);
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post-fix-orders-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
