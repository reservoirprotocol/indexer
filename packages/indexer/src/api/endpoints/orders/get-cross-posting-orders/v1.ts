/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { regex } from "@/common/utils";

const version = "v1";

export const getCrossPostingOrdersV1Options: RouteOptions = {
  description: "Cross posting status",
  notes: "Get a list of cross posting orders with status.\n\n Input your `crossPostingOrderId`into the ids param and submit for the status. \n\n The `crossPostingOrderId` is returned on the `bids` and `asks execute APIs. The `id` is also exposed on the `onProgess` callback for the SDK. ReservoirKit will not return an `id`.",
  tags: [“api”, “Create Orders (list & bid)“],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      ids: Joi.alternatives(Joi.array().items(Joi.number()), Joi.string()).description(
        "id(s) to search for."
      ),
      continuation: Joi.string()
        .pattern(regex.number)
        .description("Use continuation token to request next offset of items."),
      limit: Joi.number()
        .integer()
        .min(1)
        .max(50)
        .default(50)
        .description("Amount of items returned in response."),
    }),
  },
  response: {
    schema: Joi.object({
      orders: Joi.array().items(
        Joi.object({
          id: Joi.number().required(),
          orderId: Joi.string().required().allow(null),
          orderbook: Joi.string().required(),
          status: Joi.string().required(),
          statusReason: Joi.string().required().allow(null, ""),
          createdAt: Joi.string().required(),
          updatedAt: Joi.string().required(),
        })
      ),
      continuation: Joi.string().pattern(regex.number).allow(null),
    }).label(`getCrossPostingOrders${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-cross-posting-orders-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          cross_posting_orders.id,
          cross_posting_orders.order_id,
          cross_posting_orders.orderbook,
          cross_posting_orders.status,
          cross_posting_orders.status_reason,
          extract(epoch from cross_posting_orders.created_at) AS created_at,
          cross_posting_orders.updated_at
        FROM cross_posting_orders
      `;

      // Filters
      const conditions: string[] = [];

      if (query.ids) {
        if (Array.isArray(query.ids)) {
          conditions.push(`id IN ($/ids:csv/)`);
        } else {
          conditions.push(`id = $/ids/`);
        }
      }

      if (query.continuation) {
        (query as any).continuationId = query.continuation;

        conditions.push(`id < $/continuationId/`);
      }

      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Sorting
      baseQuery += ` ORDER BY id DESC`;

      // Pagination
      baseQuery += ` LIMIT $/limit/`;

      const rawResult = await redb.manyOrNone(baseQuery, query);

      let continuation = null;

      if (rawResult.length === query.limit) {
        continuation = rawResult[rawResult.length - 1].id;
      }

      const result = rawResult.map(async (r) => {
        return {
          id: Number(r.id),
          orderId: r.order_id,
          orderbook: r.orderbook,
          status: r.status,
          statusReason: r.status_reason,
          createdAt: new Date(r.created_at * 1000).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        };
      });

      return {
        orders: await Promise.all(result),
        continuation,
      };
    } catch (error) {
      logger.error(`get-cross-posting-orders-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
