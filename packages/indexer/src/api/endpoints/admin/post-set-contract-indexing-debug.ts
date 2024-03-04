/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { config } from "@/config/index";
import { redis } from "@/common/redis";

export const postSetContractIndexingDebugOptions: RouteOptions = {
  description: "Enable or disable contract indexing debug",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      status: Joi.string().required().valid("enable", "disable"),
      contract: Joi.string()
        .lowercase()
        .description("contract to update. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`")
        .required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    if (payload.status === "enable") {
      redis.sadd("metadata-indexing-debug-contracts", payload.contract);
    } else {
      redis.srem("metadata-indexing-debug-contracts", payload.contract);
    }
  },
};
