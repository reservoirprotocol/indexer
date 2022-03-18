/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";

const version = "v1";

export const getOrderExecutedV1Options: RouteOptions = {
  description: "Check if an order is filled/canceled",
  tags: ["api", "3. Router"],
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  validate: {
    query: Joi.object({
      id: Joi.string().required(),
    }),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const data = await edb.oneOrNone(
        `
          SELECT fillability_status FROM orders
          WHERE id = $/id/
        `,
        { id: query.id }
      );

      if (
        data?.fillability_status === "filled" ||
        data?.fillability_status === "cancelled"
      ) {
        return { message: "Order is executed" };
      }

      throw Boom.badData("Order not yet executed");
    } catch (error) {
      logger.error(
        `get-order-executed-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
