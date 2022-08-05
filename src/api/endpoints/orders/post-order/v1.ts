/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";

const version = "v1";

export const postOrderV1Options: RouteOptions = {
  description: "Publish a single order",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    payload: Joi.object({
      order: Joi.object({
        kind: Joi.string().lowercase().valid("opensea", "721ex", "zeroex-v4").required(),
        data: Joi.object().required(),
      }),
      orderbook: Joi.string().lowercase().valid("reservoir").default("reservoir"),
      source: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .description("The source address"),
      attribute: Joi.object({
        collection: Joi.string().required(),
        key: Joi.string().required(),
        value: Joi.string().required(),
      }),
    }),
  },
  handler: async (request: Request) => {
    if (config.disableOrders) {
      throw Boom.badRequest("Order posting is disabled");
    }

    const payload = request.payload as any;

    try {
      const order = payload.order;
      const orderbook = payload.orderbook;
      const source = payload.source;
      const attribute = payload.attribute;

      switch (order.kind) {
        case "721ex": {
          if (orderbook !== "reservoir") {
            throw new Error("Unsupported orderbook");
          }
          if (attribute) {
            throw new Error("Unsupported metadata");
          }

          const orderInfo: orders.openDao.OrderInfo = {
            orderParams: order.data,
            metadata: {
              source,
            },
          };
          const [result] = await orders.openDao.save([orderInfo]);
          if (result.status === "success") {
            return { message: "Success" };
          } else {
            throw Boom.badRequest(result.status);
          }
        }

        case "zeroex-v4": {
          if (orderbook !== "reservoir") {
            throw new Error("Unsupported orderbook");
          }
          if (attribute) {
            throw new Error("Unsupported metadata");
          }

          const orderInfo: orders.zeroExV4.OrderInfo = {
            orderParams: order.data,
            metadata: {
              source,
            },
          };
          const [result] = await orders.zeroExV4.save([orderInfo]);
          if (result.status === "success") {
            return { message: "Success" };
          } else {
            throw Boom.badRequest(result.status);
          }
        }
      }

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-order-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
