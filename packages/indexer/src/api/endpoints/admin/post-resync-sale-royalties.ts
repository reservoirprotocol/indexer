import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { addToQueue } from "@/jobs/backfill/backfill-sale-royalties";

export const postResyncSaleRoyalties: RouteOptions = {
  description: "Trigger the recalculation of sale royalties for any particular block range.",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      fromBlock: Joi.number().required(),
      toBlock: Joi.number().required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      await addToQueue(payload.fromBlock, payload.toBlock + 1, payload.toBlock + 1);

      return { message: "Success" };
    } catch (error) {
      logger.error("post-resync-sale-royalties", `Handler failure: ${error}`);
      throw error;
    }
  },
};
