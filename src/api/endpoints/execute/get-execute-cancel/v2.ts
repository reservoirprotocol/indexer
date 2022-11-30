/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v2";

export const getExecuteCancelV2Options: RouteOptions = {
  description: "Cancel order",
  notes: "Cancel an existing order on any marketplace",
  tags: ["api", "Router"],
  plugins: {
    "hapi-swagger": {
      order: 11,
    },
  },
  validate: {
    query: Joi.object({
      // TODO: Add support for batch cancellations (where possible)
      id: Joi.string()
        .required()
        .description("Order Id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"),
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
          id: Joi.string().required(),
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

      let cancelTx: TxData;
      let orderSide: "sell" | "buy";

      // REFACTOR: Move to SDK and handle X2Y2
      switch (orderResult.kind) {
        case "seaport": {
          const order = new Sdk.Seaport.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Seaport.Exchange(config.chainId);

          cancelTx = exchange.cancelOrderTx(query.maker, order);
          orderSide = order.getInfo()!.side;

          break;
        }

        case "looks-rare": {
          const order = new Sdk.LooksRare.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.LooksRare.Exchange(config.chainId);

          cancelTx = exchange.cancelOrderTx(query.maker, order);
          orderSide = order.params.isOrderAsk ? "sell" : "buy";

          break;
        }

        case "zeroex-v4-erc721":
        case "zeroex-v4-erc1155": {
          const order = new Sdk.ZeroExV4.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);

          cancelTx = exchange.cancelOrderTx(query.maker, order);
          orderSide =
            order.params.direction === Sdk.ZeroExV4.Types.TradeDirection.SELL ? "sell" : "buy";

          break;
        }

        case "universe": {
          const order = new Sdk.Universe.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Universe.Exchange(config.chainId);
          const { side } = order.getInfo()!;
          cancelTx = await exchange.cancelOrderTx(order.params);
          orderSide = side;

          break;
        }

        case "rarible": {
          const order = new Sdk.Rarible.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Rarible.Exchange(config.chainId);
          const { side } = order.getInfo()!;
          cancelTx = await exchange.cancelOrderTx(order.params);
          orderSide = side;

          break;
        }

        // TODO: Add support for X2Y2 (it's tricky because of the signature requirement)

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      // TODO: We should remove the "listing"/"offer" distinction once we get to bundles
      return {
        steps: [
          {
            id: "cancellation",
            action: orderSide === "sell" ? "Submit cancellation" : "Cancel offer",
            description: `To cancel this ${
              orderSide === "sell" ? "listing" : "offer"
            } you must confirm the transaction and pay the gas fee`,
            kind: "transaction",
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
    } catch (error) {
      logger.error(`get-execute-cancel-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
