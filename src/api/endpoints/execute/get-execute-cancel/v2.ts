/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v2";

export const getExecuteCancelV2Options: RouteOptions = {
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
        .pattern(regex.address)
        .required()
        .description(
          "Address of wallet cancelling the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price"),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price"),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          action: Joi.string().required(),
          description: Joi.string().required(),
          kind: Joi.string().valid("transaction").required(),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string().valid("complete", "incomplete").required(),
                data: Joi.object(),
                orderIndex: Joi.number(),
              })
            )
            .required(),
        })
      ),
    }).label(`getExecuteCancel${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-cancel-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      // Fetch the order to get cancelled
      const orderResult = await redb.oneOrNone(
        `
          SELECT
            orders.kind,
            orders.raw_data
          FROM orders
          WHERE orders.id = $/id/
            AND orders.maker = $/maker/
            AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
        `,
        {
          id: query.id,
          maker: toBuffer(query.maker),
        }
      );

      // Return early in case no order was found
      if (!orderResult) {
        throw Boom.badData("No matching order");
      }

      // Set up generic cancellation steps
      // TODO: We should remove the "listing"/"offer" distinction once we get to bundles
      const generateSteps = (side: "buy" | "sell") => [
        {
          action: side === "sell" ? "Submit cancellation" : "Cancel offer",
          description: `To cancel this ${
            side === "sell" ? "listing" : "offer"
          } you must confirm the transaction and pay the gas fee`,
          kind: "transaction",
        },
      ];

      switch (orderResult.kind) {
        case "seaport": {
          const order = new Sdk.Seaport.Order(config.chainId, orderResult.raw_data);

          // Generate exchange-specific cancellation transaction
          const exchange = new Sdk.Seaport.Exchange(config.chainId);
          const cancelTx = exchange.cancelOrderTx(query.maker, order);

          const steps = generateSteps(order.getInfo()!.side);
          return {
            steps: [
              {
                ...steps[0],
                items: [
                  {
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
                    orderIndex: 0,
                  },
                ],
              },
            ],
          };
        }

        case "looks-rare": {
          const order = new Sdk.LooksRare.Order(config.chainId, orderResult.raw_data);

          // Generate exchange-specific cancellation transaction
          const exchange = new Sdk.LooksRare.Exchange(config.chainId);
          const cancelTx = exchange.cancelOrderTx(query.maker, order);

          const steps = generateSteps(order.params.isOrderAsk ? "sell" : "buy");
          return {
            steps: [
              {
                ...steps[0],
                items: [
                  {
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
                    orderIndex: 0,
                  },
                ],
              },
            ],
          };
        }

        case "opendao-erc721":
        case "opendao-erc1155": {
          const order = new Sdk.OpenDao.Order(config.chainId, orderResult.raw_data);

          // Generate exchange-specific cancellation transaction
          const exchange = new Sdk.OpenDao.Exchange(config.chainId);
          const cancelTx = exchange.cancelOrderTx(query.maker, order);

          const steps = generateSteps(
            order.params.direction === Sdk.OpenDao.Types.TradeDirection.SELL ? "sell" : "buy"
          );
          return {
            steps: [
              {
                ...steps[0],
                items: [
                  {
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
                    orderIndex: 0,
                  },
                ],
              },
            ],
          };
        }

        case "zeroex-v4-erc721":
        case "zeroex-v4-erc1155": {
          const order = new Sdk.ZeroExV4.Order(config.chainId, orderResult.raw_data);

          // Generate exchange-specific cancellation transaction
          const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);
          const cancelTx = exchange.cancelOrderTx(query.maker, order);

          const steps = generateSteps(
            order.params.direction === Sdk.ZeroExV4.Types.TradeDirection.SELL ? "sell" : "buy"
          );
          return {
            steps: [
              {
                ...steps[0],
                items: [
                  {
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
                    orderIndex: 0,
                  },
                ],
              },
            ],
          };
        }

        case "x2y2": {
          const order = new Sdk.X2Y2.Order(config.chainId, orderResult.raw_data);

          // Generate exchange-specific cancellation transaction
          const exchange = new Sdk.X2Y2.Exchange(config.chainId, process.env.X2Y2_API_KEY!);
          const cancelTx = exchange.cancelOrderTx(query.maker, order);

          const steps = generateSteps(order.params.type as "sell" | "buy");
          return {
            steps: [
              {
                ...steps[0],
                items: [
                  {
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
                    orderIndex: 0,
                  },
                ],
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
