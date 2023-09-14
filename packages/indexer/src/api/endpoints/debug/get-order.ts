/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";

export const getOrderOptions: RouteOptions = {
  description: "Get Order Info",
  tags: ["debug"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      orderId: Joi.string(),
    }),
  },
  handler: async (request: Request) => {
    const payload = request.query as any;
    const orderId = payload.orderId;

    const [order] = await Promise.all([
      idb.oneOrNone(`SELECT * FROM "orders" "o" WHERE "o"."id" = $/id/`, {
        id: orderId,
      }),
    ]);

    if (order) {
      order.maker = fromBuffer(order.maker);
    }
    return order;
  },
};
