/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";

const version = "v1";

export const getOrderExecutedV1Options: RouteOptions = {
  description: "Check order status",
  tags: ["api", "Orders"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      id: Joi.string().required(),
      checkRecentEvents: Joi.boolean().default(false),
    }),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const data = await redb.oneOrNone(
        `
          SELECT fillability_status FROM orders
          WHERE id = $/id/
        `,
        { id: query.id }
      );

      if (data?.fillability_status === "filled" || data?.fillability_status === "cancelled") {
        return { message: "Order is executed" };
      }

      if (query.checkRecentEvents) {
        const data = await redb.oneOrNone(
          `
            SELECT 1 FROM fill_events_2
            WHERE fill_events_2.timestamp > floor(extract(epoch FROM now() - interval '5 minutes'))::INT
              AND fill_events_2.order_id = $/id/
          `,
          { id: query.id }
        );

        if (data) {
          return { message: "Order is executed" };
        }
      }

      throw Boom.badData("Order not yet executed");
    } catch (error) {
      logger.error(`get-order-executed-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
