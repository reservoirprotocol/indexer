import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";

export const getExecuteCancelOptions: RouteOptions = {
  description: "Get steps required to cancel an order.",
  tags: ["api", "execute"],
  validate: {
    query: Joi.object({
      hash: Joi.string().required(),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          action: Joi.string().required(),
          description: Joi.string().required(),
          status: Joi.string().valid("complete", "incomplete").required(),
          kind: Joi.string().valid("transaction", "confirmation").required(),
          data: Joi.any(),
        })
      ),
      error: Joi.string(),
    }).label("getExecuteCancelResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_execute_cancel_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const order = await db.one(
        `
          select "o"."raw_data" from "orders" "o"
          where "o"."hash" = $/hash/
            and "o"."maker" = $/maker/
            and (
              "o"."status" = 'valid'
              or "o"."status" = 'no-balance'
              or "o"."status" = 'disabled'
            )
        `,
        {
          hash: query.hash,
          maker: query.maker,
        }
      );

      if (!order) {
        return { error: "No matching order" };
      }

      const sdkOrder = new Sdk.WyvernV2.Order(config.chainId, order.raw_data);

      const exchange = new Sdk.WyvernV2.Exchange(config.chainId);
      const cancelTx = exchange.cancelTransaction(query.maker, sdkOrder);

      return {
        steps: [
          {
            action: "Cancel order",
            description: "Cancel order",
            status: "incomplete",
            kind: "transaction",
            data: cancelTx,
          },
          {
            action: "Confirmation",
            description: "Confirmation",
            status: "incomplete",
            kind: "confirmation",
            data: {
              endpoint: `/orders/executed?hash=${order.prefixHash()}`,
              method: "GET",
            },
          },
        ],
      };
    } catch (error) {
      logger.error("get_execute_cancel_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
