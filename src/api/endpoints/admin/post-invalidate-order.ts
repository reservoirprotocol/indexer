/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

export const postInvalidateOrderOptions: RouteOptions = {
  description: "Invalidate an existing order.",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      id: Joi.string().required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      await idb.none(
        `
          UPDATE orders SET
            fillability_status = 'cancelled',
            approval_status = 'disabled',
            updated_at = now()
          WHERE orders.id = $/id/
        `,
        { id: payload.id }
      );

      // Update any wrong caches.
      await orderUpdatesById.addToQueue([
        {
          context: `revalidation-${Date.now()}-${payload.id}`,
          id: payload.id,
          trigger: {
            kind: "revalidation",
          },
        } as orderUpdatesById.OrderInfo,
      ]);

      return { message: "Success" };
    } catch (error) {
      logger.error("post-fix-orders-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
