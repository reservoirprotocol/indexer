import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { tokenFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/transfers/get-transfers";

export const getTransfersOptions: RouteOptions = {
  description:
    "Get historical transfer events. Can filter by collection, attribute or token.",
  tags: ["api", "transfers"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string().pattern(/^[0-9]+$/),
      collection: Joi.string().lowercase(),
      attributes: Joi.object().unknown(),
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      direction: Joi.string().lowercase().valid("from", "to"),
      offset: Joi.number().integer().min(0).default(0),
      limit: Joi.number().integer().min(1).max(100).default(20),
    })
      .oxor("collection", "contract")
      .or("collection", "contract", "user")
      .with("contract", "tokenId")
      .with("attributes", "collection"),
  },
  response: {
    schema: Joi.object({
      transfers: Joi.array().items(
        Joi.object({
          token: tokenFormat,
          from: Joi.string(),
          to: Joi.string(),
          amount: Joi.number(),
          txHash: Joi.string(),
          block: Joi.number(),
          timestamp: Joi.number(),
          price: Joi.number().unsafe().allow(null),
        })
      ),
    }).label("getTransfersResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_transfers_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const transfers = await queries.getTransfers(
        query as queries.GetTransfersFilter
      );

      return { transfers };
    } catch (error) {
      logger.error("get_transfers_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
