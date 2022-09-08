/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orderbookOrders from "@/jobs/orderbook/orders-queue";

const version = "v1";

export const postSeaportOffersV1Options: RouteOptions = {
  description: "Submit multiple Seaport offers (compatible with OpenSea's API response)",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    payload: Joi.object({
      seaport_offers: Joi.array().items(
        Joi.object({
          protocol_data: Joi.object({
            parameters: Joi.any(),
            signature: Joi.string(),
          }),
        }).options({ allowUnknown: true })
      ),
    }),
  },
  handler: async (request: Request) => {
    if (config.disableOrders) {
      throw Boom.badRequest("Order posting is disabled");
    }

    const payload = request.payload as any;

    try {
      const orders = payload.seaport_offers;

      logger.info(`post-seaport-offers-${version}-handler`, `Got ${orders.length} offers`);

      const orderInfos: orderbookOrders.GenericOrderInfo[] = [];
      for (const { protocol_data } of orders) {
        orderInfos.push({
          kind: "seaport",
          info: {
            orderParams: {
              ...protocol_data.parameters,
              signature: protocol_data.signature,
            },
            metadata: {},
          },
          relayToArweave: true,
        });
      }

      await orderbookOrders.addToQueue(orderInfos, true);

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-seaport-offers-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
