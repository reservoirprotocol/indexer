/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";
import { logger } from "@/common/logger";
import { orderRevalidationsJob } from "@/jobs/order-fixes/order-revalidations-job";
import { ApiKeyManager } from "@/models/api-keys";

export const postInvalidateOrdersOptions: RouteOptions = {
  description: "Invalidate stale orders",
  tags: ["api", "Management"],
  validate: {
    headers: Joi.object({
      "x-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      ids: Joi.alternatives()
        .try(
          Joi.array()
            .max(50)
            .items(Joi.string())
            .description(
              "Array of order ids to invalidate. Max limit is 50. Example: `ids[0]: 0x505b35e849bccbd787bf670b3e85577fa5c2814cfa0ecab50867e4dc5b5362d4 ids[1]: 0xd0e83bdeb5b79352d4a3657387d1e438e9df68d773bb3b3c88da41948ef48188`"
            ),
          Joi.string().description(
            "Array of order ids to invalidate. Max limit is 50. Example: `ids[0]: 0x505b35e849bccbd787bf670b3e85577fa5c2814cfa0ecab50867e4dc5b5362d4 ids[1]: 0xd0e83bdeb5b79352d4a3657387d1e438e9df68d773bb3b3c88da41948ef48188`"
          )
        )
        .required(),
    }),
  },
  handler: async (request: Request) => {
    const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);

    if (_.isNull(apiKey)) {
      throw Boom.unauthorized("Invalid API key");
    }

    if (!apiKey.permissions?.invalidate_orders) {
      throw Boom.unauthorized("Not allowed");
    }

    const payload = request.payload as any;

    if (!_.isArray(payload.ids)) {
      payload.ids = [payload.ids];
    }

    try {
      for (const id of payload.ids) {
        await orderRevalidationsJob.addToQueue([{ by: "id", data: { id, status: "inactive" } }]);
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post-invalidate-orders-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
