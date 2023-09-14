/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";

export const postFixCacheOptions: RouteOptions = {
  description: "Trigger fixing any cache inconsistencies for array of contracts.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      kind: Joi.string().valid("tokens-floor-sell", "tokens-top-buy").required(),
      contracts: Joi.array().items(
        Joi.string()
          .lowercase()
          .pattern(/^0x[a-fA-F0-9]{40}$/)
          .required()
      ),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const kind = payload.kind;
      const contracts = payload.contracts;

      switch (kind) {
        case "tokens-floor-sell": {
          for (const contract of contracts) {
            await Collections.recalculateContractFloorSell(contract);
          }

          break;
        }

        case "tokens-top-buy": {
          for (const contract of contracts) {
            await Collections.recalculateContractTopBuy(contract);
          }

          break;
        }
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post-fix-cache-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
