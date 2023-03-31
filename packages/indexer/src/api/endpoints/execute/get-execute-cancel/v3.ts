/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v3";

export const getExecuteCancelV3Options: RouteOptions = {
  description: "Cancel orders",
  notes: "Cancel existing orders on any marketplace",
  tags: ["api", "Fill Orders (buy & sell)"],
  plugins: {
    "hapi-swagger": {
      order: 11,
    },
  },
  validate: {
    payload: Joi.object({
      orderIds: Joi.array().items(Joi.string()).min(1).optional(),
      maker: Joi.string().pattern(regex.address).optional(),
      orderKind: Joi.string()
        .valid(
          "seaport",
          "seaport-v1.4",
          "looks-rare",
          "zeroex-v4-erc721",
          "zeroex-v4-erc1155",
          "universe",
          "rarible",
          "infinity",
          "flow"
        )
        .optional(),
      token: Joi.string().pattern(regex.token).optional(),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price"),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price"),
    })
      .oxor("orderIds", "token")
      .or("orderIds", "token", "maker", "orderKind"),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          action: Joi.string().required(),
          description: Joi.string().required(),
          kind: Joi.string().valid("signature", "transaction").required(),
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
    const actionData = request.payload as any;

    // Cancel by maker
    if (!actionData.token && actionData.maker) {
      let cancelTx: TxData;
      const maker = actionData.maker;

      switch (actionData.orderKind) {
        case "seaport": {
          const exchange = new Sdk.SeaportV11.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(maker);

          break;
        }

        case "seaport-v1.4": {
          const exchange = new Sdk.SeaportV14.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(maker);
          break;
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      return {
        steps: [
          {
            id: "cancellation",
            action: "Submit cancellation",
            description: `To cancel these orders you must confirm the transaction and pay the gas fee`,
            kind: "transaction",
            items: [
              {
                status: "incomplete",
                data: {
                  ...cancelTx,
                  maxFeePerGas: actionData.maxFeePerGas
                    ? bn(actionData.maxFeePerGas).toHexString()
                    : undefined,
                  maxPriorityFeePerGas: actionData.maxPriorityFeePerGas
                    ? bn(actionData.maxPriorityFeePerGas).toHexString()
                    : undefined,
                },
                orderIndex: 0,
              },
            ],
          },
        ],
      };
    }

    // Cancel by tokenId or multile orderIds
    try {
      // Fetch the orders to get cancelled
      const orderResults = actionData.token
        ? await redb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                orders.maker,
                orders.raw_data
              FROM orders
              WHERE orders.token_set_id = $/token_set_id/ 
              AND side = $/side/
              AND maker = $/maker/
              AND kind = $/order_kind/
              AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            `,
            {
              side: "sell",
              token_set_id: `token:${actionData.token}`,
              maker: toBuffer(actionData.maker),
              order_kind: actionData.orderKind,
            }
          )
        : await redb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                orders.maker,
                orders.raw_data
              FROM orders
              WHERE orders.id IN ($/id:csv/)
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            `,
            { id: actionData.orderIds }
          );

      // Return early in case no order was found
      if (!orderResults.length) {
        throw Boom.badRequest("No matching order");
      }

      const isBulkCancel = orderResults.length > 1;
      const orderResult = orderResults[0];

      // Make sure all order is same kind
      const supportedKinds = ["seaport-v1.4", "seaport"];
      if (isBulkCancel) {
        const isSupportBulk =
          supportedKinds.includes(orderResult.kind) &&
          orderResults.every((c) => c.kind === orderResult.kind);
        if (!isSupportBulk) {
          throw Boom.badRequest("Bulk cancel not supported");
        }
      }

      // Handle on-chain cancellations

      let cancelTx: TxData;

      const maker = fromBuffer(orderResult.maker);

      // REFACTOR: Move to SDK and handle X2Y2
      switch (orderResult.kind) {
        case "seaport": {
          const orders = orderResults.map((dbOrder) => {
            return new Sdk.SeaportV11.Order(config.chainId, dbOrder.raw_data);
          });
          const exchange = new Sdk.SeaportV11.Exchange(config.chainId);

          cancelTx = exchange.cancelOrdersTx(maker, orders);
          break;
        }

        case "seaport-v1.4": {
          const orders = orderResults.map((dbOrder) => {
            return new Sdk.SeaportV11.Order(config.chainId, dbOrder.raw_data);
          });
          const exchange = new Sdk.SeaportV11.Exchange(config.chainId);

          cancelTx = exchange.cancelOrdersTx(maker, orders);
          break;
        }

        case "looks-rare": {
          const order = new Sdk.LooksRare.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.LooksRare.Exchange(config.chainId);

          cancelTx = exchange.cancelOrderTx(maker, order);

          break;
        }

        case "zeroex-v4-erc721":
        case "zeroex-v4-erc1155": {
          const order = new Sdk.ZeroExV4.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);

          cancelTx = exchange.cancelOrderTx(maker, order);
          break;
        }

        case "universe": {
          const order = new Sdk.Universe.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Universe.Exchange(config.chainId);
          cancelTx = await exchange.cancelOrderTx(order.params);

          break;
        }

        case "rarible": {
          const order = new Sdk.Rarible.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Rarible.Exchange(config.chainId);
          cancelTx = await exchange.cancelOrderTx(order.params);

          break;
        }

        case "infinity": {
          const order = new Sdk.Infinity.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Infinity.Exchange(config.chainId);
          const nonce = order.nonce;
          cancelTx = exchange.cancelMultipleOrdersTx(order.signer, [nonce]);

          break;
        }

        case "flow": {
          const order = new Sdk.Flow.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Flow.Exchange(config.chainId);
          const nonce = order.nonce;
          cancelTx = exchange.cancelMultipleOrdersTx(order.signer, [nonce]);

          break;
        }

        // TODO: Add support for X2Y2 (it's tricky because of the signature requirement)

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      return {
        steps: [
          {
            id: "cancellation",
            action: "Submit cancellation",
            description: `To cancel ${
              isBulkCancel ? "these orders" : "this order"
            } you must confirm the transaction and pay the gas fee`,
            kind: "transaction",
            items: [
              {
                status: "incomplete",
                data: {
                  ...cancelTx,
                  maxFeePerGas: actionData.maxFeePerGas
                    ? bn(actionData.maxFeePerGas).toHexString()
                    : undefined,
                  maxPriorityFeePerGas: actionData.maxPriorityFeePerGas
                    ? bn(actionData.maxPriorityFeePerGas).toHexString()
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
