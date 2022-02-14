import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";

export const getOrdersExecutedOptions: RouteOptions = {
  description:
    "Returns whether an order was executed (filled or cancelled) or not.",
  tags: ["api", "orders"],
  validate: {
    query: Joi.object({
      hash: Joi.string().required(),
    }),
  },
  response: {
    schema: Joi.any().label("getOrdersExecutedResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_orders_executed_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const data = await db.oneOrNone(
        `
          select "o"."status" from "orders" "o"
          where "o"."hash" = $/hash/
        `,
        { hash: query.hash }
      );

      if (data?.status === "filled" || data?.status === "cancelled") {
        return { message: "Success" };
      }

      throw Boom.notFound("Order not yet executed");
    } catch (error) {
      logger.error("get_orders_executed_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
