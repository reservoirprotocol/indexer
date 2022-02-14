import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { tokenFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/transfers/get-sales";

export const getSalesOptions: RouteOptions = {
  description:
    "Get historical sales. Can filter by collection, attribute or token.",
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
      side: Joi.string().lowercase().valid("buy", "sell"),
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
      sales: Joi.array().items(
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
    }).label("getSalesResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_sales_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const sales = await queries.getSales(query as queries.GetSalesFilter);

      return { sales };
    } catch (error) {
      logger.error("get_sales_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
