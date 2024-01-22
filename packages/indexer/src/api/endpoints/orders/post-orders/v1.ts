/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { orderbookOrdersJob } from "@/jobs/orderbook/orderbook-orders-job";
import { GenericOrderInfo } from "@/jobs/orderbook/utils";

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
              "blur",
              "zeroex-v4",
              "x2y2",
              "seaport-v1.4",
              "seaport-v1.5",
              "element",
              "rarible",
              "manifold",
              "looks-rare-v2"
            )
            .required(),
          data: Joi.object().required(),
          originatedAt: Joi.string(),
          source: Joi.string(),
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

      const orderInfos: GenericOrderInfo[] = [];
      for (const { kind, data, originatedAt, source } of orders) {
        let orderInfoSource;
        switch (source) {
          case "opensea":
            orderInfoSource = "opensea.io";
            break;
          case "okx":
            orderInfoSource = "okx.com";
            break;
          case "imtbl-orderbook":
            orderInfoSource = "immutable.com";
            break;
        }

        orderInfos.push({
          kind,
          info: {
            orderParams: data,
            metadata: {
              originatedAt,
              source: orderInfoSource,
            },
            isOpenSea: source === "opensea",
            isOkx: source === "okx",
            isImtbl: source === "imtbl-orderbook",
          },
          validateBidValue: true,
        });
      }

      await orderbookOrdersJob.addToQueue(orderInfos);

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-orders-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
