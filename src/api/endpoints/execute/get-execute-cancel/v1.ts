/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v1";

export const getExecuteCancelV1Options: RouteOptions = {
  description: "Cancel order",
  notes: "Cancel an existing order on any marketplace",
  tags: ["api", "Orderbook"],
  plugins: {
    "hapi-swagger": {
      order: 11,
    },
  },
  validate: {
    query: Joi.object({
      id: Joi.string()
        .required()
        .description("Collection ID. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63``"),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required()
        .description(
          "Address of wallet cancelling the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      maxFeePerGas: Joi.string()
        .pattern(/^[0-9]+$/)
        .description("Optional. Set custom gas price"),
      maxPriorityFeePerGas: Joi.string()
        .pattern(/^[0-9]+$/)
        .description("Optional. Set custom gas price"),
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
      logger.error(`get-execute-cancel-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      // Fetch the order to get cancelled.
      const orderResult = await redb.oneOrNone(
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

      // Return early in case no order was found.
      if (!orderResult) {
        throw Boom.badData("No matching order");
      }

      // Set up generic cancellation steps.
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
          const order = new Sdk.WyvernV23.Order(config.chainId, orderResult.raw_data);

          // Generate exchange-specific cancellation transaction.
          const exchange = new Sdk.WyvernV23.Exchange(config.chainId);
          const cancelTx = exchange.cancelTransaction(query.maker, order);

          const steps = generateSteps(
            order.params.side === Sdk.WyvernV23.Types.OrderSide.SELL ? "sell" : "buy"
          );
          return {
            steps: [
              {
                ...steps[0],
                status: "incomplete",
                data: {
                  ...cancelTx,
                  maxFeePerGas: query.maxFeePerGas
                    ? bn(query.maxFeePerGas).toHexString()
                    : undefined,
                  maxPriorityFeePerGas: query.maxPriorityFeePerGas
                    ? bn(query.maxPriorityFeePerGas).toHexString()
                    : undefined,
                },
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

        case "seaport": {
          const order = new Sdk.Seaport.Order(config.chainId, orderResult.raw_data);

          // Generate exchange-specific cancellation transaction.
          const exchange = new Sdk.Seaport.Exchange(config.chainId);
          const cancelTx = exchange.cancelOrderTx(query.maker, order);

          const steps = generateSteps(order.getInfo()!.side);
          return {
            steps: [
              {
                ...steps[0],
                status: "incomplete",
                data: {
                  ...cancelTx,
                  maxFeePerGas: query.maxFeePerGas
                    ? bn(query.maxFeePerGas).toHexString()
                    : undefined,
                  maxPriorityFeePerGas: query.maxPriorityFeePerGas
                    ? bn(query.maxPriorityFeePerGas).toHexString()
                    : undefined,
                },
              },
              {
                ...steps[1],
                status: "incomplete",
                data: {
                  endpoint: `/orders/executed/v1?id=${order.hash()}`,
                  method: "GET",
                },
              },
            ],
          };
        }

        case "looks-rare": {
          const order = new Sdk.LooksRare.Order(config.chainId, orderResult.raw_data);

          // Generate exchange-specific cancellation transaction.
          const exchange = new Sdk.LooksRare.Exchange(config.chainId);
          const cancelTx = exchange.cancelTransaction(query.maker, order);

          const steps = generateSteps(order.params.isOrderAsk ? "sell" : "buy");
          return {
            steps: [
              {
                ...steps[0],
                status: "incomplete",
                data: {
                  ...cancelTx,
                  maxFeePerGas: query.maxFeePerGas
                    ? bn(query.maxFeePerGas).toHexString()
                    : undefined,
                  maxPriorityFeePerGas: query.maxPriorityFeePerGas
                    ? bn(query.maxPriorityFeePerGas).toHexString()
                    : undefined,
                },
              },
              {
                ...steps[1],
                status: "incomplete",
                data: {
                  endpoint: `/orders/executed/v1?id=${order.hash()}`,
                  method: "GET",
                },
              },
            ],
          };
        }

        case "opendao-erc721":
        case "opendao-erc1155": {
          const order = new Sdk.OpenDao.Order(config.chainId, orderResult.raw_data);

          // Generate exchange-specific cancellation transaction.
          const exchange = new Sdk.OpenDao.Exchange(config.chainId);
          const cancelTx = exchange.cancelTransaction(query.maker, order);

          const steps = generateSteps(
            order.params.direction === Sdk.OpenDao.Types.TradeDirection.SELL ? "sell" : "buy"
          );
          return {
            steps: [
              {
                ...steps[0],
                status: "incomplete",
                data: {
                  ...cancelTx,
                  maxFeePerGas: query.maxFeePerGas
                    ? bn(query.maxFeePerGas).toHexString()
                    : undefined,
                  maxPriorityFeePerGas: query.maxPriorityFeePerGas
                    ? bn(query.maxPriorityFeePerGas).toHexString()
                    : undefined,
                },
              },
              {
                ...steps[1],
                status: "incomplete",
                data: {
                  endpoint: `/orders/executed/v1?id=${order.hash()}`,
                  method: "GET",
                },
              },
            ],
          };
        }

        case "zeroex-v4-erc721":
        case "zeroex-v4-erc1155": {
          const order = new Sdk.ZeroExV4.Order(config.chainId, orderResult.raw_data);

          // Generate exchange-specific cancellation transaction.
          const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);
          const cancelTx = exchange.cancelTransaction(query.maker, order);

          const steps = generateSteps(
            order.params.direction === Sdk.ZeroExV4.Types.TradeDirection.SELL ? "sell" : "buy"
          );
          return {
            steps: [
              {
                ...steps[0],
                status: "incomplete",
                data: {
                  ...cancelTx,
                  maxFeePerGas: query.maxFeePerGas
                    ? bn(query.maxFeePerGas).toHexString()
                    : undefined,
                  maxPriorityFeePerGas: query.maxPriorityFeePerGas
                    ? bn(query.maxPriorityFeePerGas).toHexString()
                    : undefined,
                },
              },
              {
                ...steps[1],
                status: "incomplete",
                data: {
                  endpoint: `/orders/executed/v1?id=${order.hash()}`,
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
      logger.error(`get-execute-cancel-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
