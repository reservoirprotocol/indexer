import { AddressZero } from "@ethersproject/constants";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { wyvernV2OrderFormat } from "@/api/types";
import { logger } from "@/common/logger";
import * as wyvernV2 from "@/orders/wyvern-v2";

export const getOrdersBuildOptions: RouteOptions = {
  description:
    "Build an order object that abstracts different token / order types. The response can be passed to SDK for signing.",
  tags: ["api", "x-deprecated"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string(),
      collection: Joi.string().lowercase(),
      attributeKey: Joi.string(),
      attributeValue: Joi.string(),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
      side: Joi.string().lowercase().valid("sell", "buy").required(),
      price: Joi.string().required(),
      fee: Joi.alternatives(Joi.string(), Joi.number()).required(),
      feeRecipient: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .disallow(AddressZero)
        .required(),
      listingTime: Joi.alternatives(Joi.string(), Joi.number()),
      expirationTime: Joi.alternatives(Joi.string(), Joi.number()),
      salt: Joi.string(),
    })
      .or("contract", "collection")
      .oxor("contract", "collection")
      .with("contract", "tokenId")
      .with("attributeKey", ["collection", "attributeValue"]),
  },
  response: {
    schema: Joi.object({
      order: Joi.object({
        // TODO: When time comes, add support for other order formats
        // apart from WyvernV2 which is the only one supported for now
        params: wyvernV2OrderFormat,
      }).allow(null),
    }).label("getOrdersBuildResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_orders_build_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const order = await wyvernV2.buildOrder(
        query as wyvernV2.BuildOrderOptions
      );

      if (!order) {
        return { order: null };
      }

      return {
        order: {
          params: order.params,
        },
      };
    } catch (error) {
      logger.error("get_orders_build_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
