import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { wyvernV2OrderFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as queries from "@/entities/orders/get-orders-all";

export const getOrdersAllOptions: RouteOptions = {
  description: "Get all valid orders by side sorted by the creation date.",
  tags: ["api", "orders"],
  validate: {
    query: Joi.object({
      side: Joi.string().lowercase().valid("buy", "sell"),
      sortDirection: Joi.string()
        .lowercase()
        .valid("asc", "desc")
        .default("asc"),
      continuation: Joi.string().pattern(/^\d+_0x[a-f0-9]{64}$/),
      limit: Joi.number().integer().min(1).max(1000).default(50),
      startTime: Joi.date().timestamp("unix"),
      endTime: Joi.date().timestamp("unix").min(Joi.ref('startTime')),
    }),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          hash: Joi.string(),
          tokenSetId: Joi.string(),
          schema: Joi.object({
            data: Joi.object().unknown(),
            kind: Joi.string(),
          }),
          metadata: Joi.object({
            collectionName: Joi.string().allow(null, ""),
            tokenName: Joi.string().allow(null, ""),
          }).allow(null),
          kind: Joi.string(),
          side: Joi.string(),
          maker: Joi.string(),
          price: Joi.number().unsafe(),
          value: Joi.number().unsafe(),
          validFrom: Joi.number(),
          validUntil: Joi.number(),
          sourceInfo: Joi.object({
            id: Joi.string(),
            bps: Joi.number(),
          }),
          royaltyInfo: Joi.array()
            .items(Joi.object({ recipient: Joi.string(), bps: Joi.number() }))
            .allow(null),
          createdAt: Joi.string(),
          rawData: Joi.object().when("kind", {
            is: Joi.equal("wyvern-v2"),
            then: wyvernV2OrderFormat,
          }),
        })
      ),
      continuation: Joi.string()
        .pattern(/^\d+_0x[a-f0-9]{64}$/)
        .allow(null),
    }).label("getOrdersAllResponse"),
    failAction: (_request, _h, error) => {
      logger.error("get_orders_all_handler", `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const { orders, continuation } = await queries.getOrdersAll(
        query as queries.GetOrdersAllFilter
      );

      return { orders, continuation };
    } catch (error) {
      logger.error("get_orders_all_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
