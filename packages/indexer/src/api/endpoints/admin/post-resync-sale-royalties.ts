import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import { addToQueue } from "@/jobs/backfill/backfill-sale-royalties";

export const postResyncSaleRoyalties: RouteOptions = {
  description: "Trigger the recalculation of sale royalties for any particular block range.",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.alternatives(
      Joi.object({
        kind: "all",
        data: Joi.object({
          fromBlock: Joi.number().required(),
          toBlock: Joi.number().required(),
          blockRange: Joi.number(),
        }),
      }),
      Joi.object({
        kind: "contract",
        data: Joi.object({
          contract: Joi.string().pattern(regex.address).required(),
          fromTimestamp: Joi.number().required(),
          toTimestamp: Joi.number().required(),
          timestampRange: Joi.number(),
        }),
      }),
      Joi.object({
        kind: "transaction",
        data: Joi.object({
          txHash: Joi.string().pattern(regex.bytes32).required(),
        }),
      })
    ),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      await addToQueue(payload);

      return { message: "Success" };
    } catch (error) {
      logger.error("post-resync-sale-royalties", `Handler failure: ${error}`);
      throw error;
    }
  },
};
