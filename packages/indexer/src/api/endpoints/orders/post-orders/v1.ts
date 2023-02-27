/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";

const version = "v1";

export const postOrdersV1Options: RouteOptions = {
  description: "Submit order batch",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          kind: Joi.string()
            .lowercase()
            .valid(
              "looks-rare",
              "zeroex-v4",
              "x2y2",
              "seaport",
              "seaport-v1.4",
              "element",
              "blur",
              "rarible",
              "manifold",
              "infinity",
              "flow"
            )
            .required(),
          data: Joi.object().required(),
        })
      ),
    }),
  },
  handler: async (request: Request) => {
    if (config.disableOrders) {
      throw Boom.badRequest("Order posting is disabled");
    }

    // This is only to support X2Y2 orders which cannot be validated
    // in a trustless way (eg. their APIs do not return the raw data
    // of the orders for anyone to validate).
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const orders = payload.orders;

      logger.info(`post-orders-${version}-handler`, `Got ${orders.length} orders`);

      const orderInfos: orderbookOrders.GenericOrderInfo[] = [];
      for (const { kind, data } of orders) {
        orderInfos.push({
          kind,
          info: {
            kind: "full",
            orderParams: data,
            metadata: {},
          },
          relayToArweave: true,
          validateBidValue: true,
        });
      }

      await orderbookOrders.addToQueue(orderInfos);

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-orders-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
