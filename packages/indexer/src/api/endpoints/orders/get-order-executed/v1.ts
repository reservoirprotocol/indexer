/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";

const version = "v1";

export const getOrderExecutedV1Options: RouteOptions = {
  description: "Order status",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 5,
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      ids: Joi.alternatives(Joi.array().items(Joi.string()), Joi.string()).required(),
    }),
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    // Ensure `query.ids` is an array
    if (!Array.isArray(query.ids)) {
      query.ids = [query.ids];
    }

    try {
      const data = await redb.manyOrNone(
        `
          SELECT
            orders.id,
            orders.fillability_status,
            orders.token_set_id,
            fill_events_2.amount,
            fill_events_2.taker
          FROM orders
          LEFT JOIN fill_events_2
            ON fill_events_2.order_id = orders.id
            AND fill_events_2.timestamp > floor(extract(epoch FROM now() - interval '5 minutes'))::INT
          WHERE orders.id IN ($/ids:csv/)
        `,
        { ids: query.ids }
      );

      const result = data.map(({ id, fillability_status, token_set_id, amount, taker }) => ({
        id: id,
        status: ["cancelled", "filled"].includes(fillability_status) ? "executed" : "fillable",
        tokenSetId: token_set_id,
        filledAmount: amount,
        filledBy: taker ? fromBuffer(taker) : null,
      }));

      if (!result.some(({ status, filledBy }) => status === "executed" || Boolean(filledBy))) {
        throw Boom.badData("Orders not recently executed");
      }

      return { orders: result };
    } catch (error) {
      logger.error(`get-order-executed-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
