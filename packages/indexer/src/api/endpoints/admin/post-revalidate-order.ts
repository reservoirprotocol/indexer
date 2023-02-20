import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orderUpdatesById from "@/jobs/order-updates/by-id-queue";

export const postRevalidateOrderOptions: RouteOptions = {
  description: "Revalidate an existing order",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      id: Joi.string().required(),
      status: Joi.string().valid("active", "inactive").required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      await idb.none(
        `
          UPDATE orders SET
            fillability_status = '${payload.status === "active" ? "fillable" : "cancelled"}',
            approval_status = '${payload.status === "active" ? "approved" : "disabled"}',
            updated_at = now()
          WHERE orders.id = $/id/
        `,
        { id: payload.id }
      );

      // Recheck the order
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
      logger.error("post-revalidate-order-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
