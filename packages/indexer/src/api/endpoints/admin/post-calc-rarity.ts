/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { rarityQueueJob } from "@/jobs/collection-updates/rarity-queue-job";

export const postCalcRarityOptions: RouteOptions = {
  description: "Trigger calculation of the give collection tokens rarity",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .description(
          "The collection for which to calculate the rarity, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const collectionId = payload.collection;
      await rarityQueueJob.addToQueue({ collectionId }, 0);

      return { message: "Request accepted" };
    } catch (error) {
      logger.error("post-calc-rarity-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
