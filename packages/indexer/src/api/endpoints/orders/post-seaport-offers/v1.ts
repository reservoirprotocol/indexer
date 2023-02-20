/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";

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
      seaport_offers: Joi.array()
        .items(
          Joi.object({
            protocol_data: Joi.object({
              parameters: Joi.any(),
              signature: Joi.string(),
            }),
          }).options({ allowUnknown: true })
        )
        .min(1),
    }),
  },
  handler: async (request: Request) => {
    if (config.disableOrders) {
      throw Boom.badRequest("Order posting is disabled");
    }

    const payload = request.payload as any;

    try {
      const orders = payload.seaport_offers;

      if (orders) {
        logger.info(`post-seaport-offers-${version}-handler`, `Got ${orders.length} offers`);
      }

      // Disabled logic in order to support filling partial collection offers from OS Realtime API
      // const orderInfos: orderbookOrders.GenericOrderInfo[] = [];
      // for (const { protocol_data } of orders) {
      //   orderInfos.push({
      //     kind: "seaport",
      //     info: {
      //       kind: "full",
      //       orderParams: {
      //         ...protocol_data.parameters,
      //         signature: protocol_data.signature,
      //       },
      //       metadata: {},
      //     },
      //     relayToArweave: true,
      //     validateBidValue: true,
      //   });
      // }
      //
      // await orderbookOrders.addToQueue(orderInfos);

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-seaport-offers-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
