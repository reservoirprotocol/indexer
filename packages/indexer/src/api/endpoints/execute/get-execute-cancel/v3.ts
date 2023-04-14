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
      orderIds: Joi.array().items(Joi.string()).min(1),
      maker: Joi.string().pattern(regex.address),
      orderKind: Joi.string().valid(
        "seaport",
        "seaport-v1.4",
        "looks-rare",
        "zeroex-v4-erc721",
        "zeroex-v4-erc1155",
        "universe",
        "rarible",
        "flow",
        "alienswap"
      ),
      token: Joi.string().pattern(regex.token),
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

    const gasSettings = {
      maxFeePerGas: actionData.maxFeePerGas ? bn(actionData.maxFeePerGas).toHexString() : undefined,
      maxPriorityFeePerGas: actionData.maxPriorityFeePerGas
        ? bn(actionData.maxPriorityFeePerGas).toHexString()
        : undefined,
    };

    // Cancel by maker
    if (actionData.maker && !actionData.token) {
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

        case "alienswap": {
          const exchange = new Sdk.Alienswap.Exchange(config.chainId);
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
            description:
              "To cancel these orders you must confirm the transaction and pay the gas fee",
            kind: "transaction",
            items: [
              {
                status: "incomplete",
                data: {
                  ...cancelTx,
                  ...gasSettings,
                },
              },
            ],
          },
        ],
      };
    }

    // Cancel by token or order ids
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
                AND kind = $/orderKind/
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            `,
            {
              side: "sell",
              token_set_id: `token:${actionData.token}`,
              maker: toBuffer(actionData.maker),
              orderKind: actionData.orderKind,
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
              WHERE orders.id IN ($/ids:csv/)
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            `,
            {
              ids: actionData.orderIds,
            }
          );

      // Return early in case no matching orders were found
      if (!orderResults.length) {
        throw Boom.badRequest("No matching order(s)");
      }

      const isBulkCancel = orderResults.length > 1;
      const orderResult = orderResults[0];

      // When bulk-cancelling, make sure all orders have the same kind
      const supportedKinds = ["seaport", "seaport-v1.4", "alienswap"];
      if (isBulkCancel) {
        const supportsBulkCancel =
          supportedKinds.includes(orderResult.kind) &&
          orderResults.every((o) => o.kind === orderResult.kind);
        if (!supportsBulkCancel) {
          throw Boom.notImplemented("Bulk cancelling not supported");
        }
      }

      // Handle off-chain cancellations

      const cancellationZone = Sdk.SeaportV14.Addresses.CancellationZone[config.chainId];
      const areAllSeaportV14OracleCancellable = orderResults.every(
        (o) => o.kind === "seaport-v1.4" && o.raw_data.zone === cancellationZone
      );
      const areAllAlienswapOracleCancellable = orderResults.every(
        (o) => o.kind === "alienswap" && o.raw_data.zone === cancellationZone
      );
      let allOracleCancellableKind = "";
      if (areAllSeaportV14OracleCancellable) {
        allOracleCancellableKind = "seaport-v1.4";
      } else if (areAllAlienswapOracleCancellable) {
        allOracleCancellableKind = "alienswap";
      }

      if (allOracleCancellableKind) {
        return {
          steps: [
            {
              id: "cancellation-signature",
              action: "Cancel order",
              description: "Authorize the cancellation of the order",
              kind: "signature",
              items: [
                {
                  status: "incomplete",
                  data: {
                    sign: {
                      signatureKind: "eip712",
                      domain: {
                        name: "SignedZone",
                        version: "1.0.0",
                        chainId: config.chainId,
                        verifyingContract: cancellationZone,
                      },
                      types: { OrderHashes: [{ name: "orderHashes", type: "bytes32[]" }] },
                      value: {
                        orderHashes: orderResults.map((o) => o.id),
                      },
                      primaryType: "OrderHashes",
                    },
                    post: {
                      endpoint: "/execute/cancel-signature/v1",
                      method: "POST",
                      body: {
                        orderIds: orderResults.map((o) => o.id).sort(),
                        orderKind: allOracleCancellableKind,
                      },
                    },
                  },
                },
              ],
            },
          ],
        };
      }

      // Handle on-chain cancellations

      let cancelTx: TxData;

      const maker = fromBuffer(orderResult.maker);
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
            return new Sdk.SeaportV14.Order(config.chainId, dbOrder.raw_data);
          });
          const exchange = new Sdk.SeaportV14.Exchange(config.chainId);

          cancelTx = exchange.cancelOrdersTx(maker, orders);
          break;
        }

        case "alienswap": {
          const orders = orderResults.map((dbOrder) => {
            return new Sdk.Alienswap.Order(config.chainId, dbOrder.raw_data);
          });
          const exchange = new Sdk.Alienswap.Exchange(config.chainId);

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
                  ...gasSettings,
                },
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
