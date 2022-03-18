/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v1";

export const getExecuteCancelV1Options: RouteOptions = {
  description: "Cancel an existing order",
  tags: ["api", "3. Router"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      id: Joi.string().required(),
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
          kind: Joi.string()
            .valid("request", "signature", "transaction", "confirmation")
            .required(),
          data: Joi.object(),
        })
      ),
      query: Joi.object(),
    }).label(`getExecuteCancel${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-execute-cancel-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const orderResult = await edb.oneOrNone(
        `
          SELECT "kind", "raw_data" FROM "orders"
          WHERE "id" = $/id/
            AND "maker" = $/maker/
            AND ("fillability_status" = 'fillable' OR "fillability_status" = 'no-balance')
        `,
        {
          id: query.id,
          maker: toBuffer(query.maker),
        }
      );
      if (!orderResult) {
        throw Boom.badData("No matching order");
      }

      const generateSteps = (side: "buy" | "sell") => [
        {
          action: side === "sell" ? "Submit cancellation" : "Cancel offer",
          description: `To cancel this ${
            side === "sell" ? "listing" : "offer"
          } you must confirm the transaction and pay the gas fee`,
          kind: "transaction",
        },
        {
          action: "Confirmation",
          description: `Verify that the ${
            side === "sell" ? "listing" : "offer"
          } was successfully cancelled`,
          kind: "confirmation",
        },
      ];

      switch (orderResult.kind) {
        case "wyvern-v2.3": {
          const order = new Sdk.WyvernV23.Order(
            config.chainId,
            orderResult.raw_data
          );

          const exchange = new Sdk.WyvernV23.Exchange(config.chainId);
          const cancelTx = exchange.cancelTransaction(query.maker, order);

          const steps = generateSteps(
            order.params.side === Sdk.WyvernV23.Types.OrderSide.SELL
              ? "sell"
              : "buy"
          );

          return {
            steps: [
              {
                ...steps[0],
                status: "incomplete",
                data: cancelTx,
              },
              {
                ...steps[1],
                status: "incomplete",
                data: {
                  endpoint: `/orders/executed/v1?id=${order.prefixHash()}`,
                  method: "GET",
                },
              },
            ],
          };
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }
    } catch (error) {
      logger.error(
        `get-execute-cancel-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
