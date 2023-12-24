/* eslint-disable @typescript-eslint/no-explicit-any */

import { splitSignature } from "@ethersproject/bytes";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";

import * as crossPostingOrdersModel from "@/models/cross-posting-orders";
import { orderbookPostOrderExternalOpenseaJob } from "@/jobs/orderbook/post-order-external/orderbook-post-order-external-opensea-job";

const version = "v2";

export const postOrderV2Options: RouteOptions = {
  description: "Submit single order",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      signature: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]+$/),
    }),
    payload: Joi.object({
      order: Joi.object({
        kind: Joi.string().lowercase().valid("opensea", "zeroex-v4", "seaport", "x2y2").required(),
        data: Joi.object().required(),
      }),
      orderbook: Joi.string().lowercase().valid("reservoir", "opensea").default("reservoir"),
      orderbookApiKey: Joi.string(),
      source: Joi.string().description("The name of the source"),
      attribute: Joi.object({
        collection: Joi.string().required(),
        key: Joi.string().required(),
        value: Joi.string().required(),
      }),
      collection: Joi.string(),
      tokenSetId: Joi.string(),
      isNonFlagged: Joi.boolean(),
    }).oxor("tokenSetId", "collection", "attribute"),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
      orderId: Joi.string().allow(null),
      crossPostingOrderId: Joi.string().description(
        "Only available when posting to external orderbook. Can be used to retrieve the status of a cross-post order."
      ),
      crossPostingOrderStatus: Joi.string(),
    }).label(`postOrder${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-order-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    if (config.disableOrders) {
      throw Boom.badRequest("Order posting is disabled");
    }

    const query = request.query as any;
    const payload = request.payload as any;

    try {
      const order = payload.order;
      const orderbook = payload.orderbook;
      const orderbookApiKey = payload.orderbookApiKey;
      const source = payload.source;

      // We'll always have only one of the below cases:
      // Only relevant/present for attribute bids
      const attribute = payload.attribute;
      // Only relevant for collection bids
      const collection = payload.collection;
      // Only relevant for token set bids
      const tokenSetId = payload.tokenSetId;

      // Only relevant for non-flagged tokens bids
      const isNonFlagged = payload.isNonFlagged;

      const signature = query.signature ?? order.data.signature;
      if (signature) {
        try {
          const { v, r, s } = splitSignature(signature);

          // If the signature is provided via query parameters, use it
          order.data = {
            ...order.data,
            // To cover everything:
            // - orders requiring a single signature field
            // - orders requiring split signature fields
            signature,
            v,
            r,
            s,
          };
        } catch {
          // Skip errors
        }
      }

      let schema: any;
      if (attribute) {
        schema = {
          kind: "attribute",
          data: {
            collection: attribute.collection,
            isNonFlagged: isNonFlagged || undefined,
            attributes: [
              {
                key: attribute.key,
                value: attribute.value,
              },
            ],
          },
        };
      } else if (collection && isNonFlagged) {
        schema = {
          kind: "collection-non-flagged",
          data: {
            collection,
          },
        };
      } else if (collection) {
        schema = {
          kind: "collection",
          data: {
            collection,
          },
        };
      } else if (tokenSetId) {
        schema = {
          kind: "token-set",
          data: {
            tokenSetId,
          },
        };
      }

      switch (order.kind) {
        case "zeroex-v4": {
          if (orderbook !== "reservoir") {
            throw new Error("Unsupported orderbook");
          }

          const orderInfo: orders.zeroExV4.OrderInfo = {
            orderParams: order.data,
            metadata: {
              schema,
              source,
            },
          };

          // Only the relayer can post Coinbase NFT orders
          if (orderInfo.orderParams.cbOrderId) {
            throw new Error("Unauthorized");
          }

          const [result] = await orders.zeroExV4.save([orderInfo]);

          if (result.status === "already-exists") {
            return { message: "Success", orderId: result.id };
          }

          if (result.status === "success") {
            return { message: "Success", orderId: result.id };
          } else {
            const error = Boom.badRequest(result.status);
            error.output.payload.orderId = result.id;
            throw error;
          }
        }

        case "seaport": {
          if (!["opensea", "reservoir"].includes(orderbook)) {
            throw new Error("Unsupported orderbook");
          }

          let crossPostingOrder;

          const orderId = new Sdk.SeaportV11.Order(
            config.chainId,
            order.data as Sdk.SeaportBase.Types.OrderComponents
          ).hash();

          if (orderbook === "opensea") {
            crossPostingOrder = await crossPostingOrdersModel.saveOrder({
              orderId,
              kind: order.kind,
              orderbook,
              source,
              schema,
              rawData: order.data,
            } as crossPostingOrdersModel.CrossPostingOrder);

            await orderbookPostOrderExternalOpenseaJob.addToQueue({
              crossPostingOrderId: crossPostingOrder.id,
              orderId,
              orderData: order.data,
              orderSchema: schema,
              orderbook,
              orderbookApiKey,
            });
          } else {
            const orderInfo: orders.seaport.OrderInfo = {
              orderParams: order.data,
              isReservoir: true,
              metadata: {
                schema,
                source,
              },
            };

            const [result] = await orders.seaport.save([orderInfo]);

            if (!["success", "already-exists"].includes(result.status)) {
              const error = Boom.badRequest(result.status);
              error.output.payload.orderId = result.id;
              throw error;
            }
          }

          return {
            message: "Success",
            orderId,
            crossPostingOrderId: crossPostingOrder?.id,
            crossPostingOrderStatus: crossPostingOrder?.status,
          };
        }

        case "opensea": {
          if (orderbook !== "reservoir") {
            throw new Error("Unsupported orderbook");
          }

          const orderObject = new Sdk.SeaportV11.Order(config.chainId, {
            ...order.data.parameters,
            signature: order.data.signature,
          });

          const orderInfo: orders.seaport.OrderInfo = {
            orderParams: orderObject.params,
            metadata: {
              schema,
            },
          };

          const [result] = await orders.seaport.save([orderInfo]);

          if (result.status === "already-exists") {
            return { message: "Success", orderId: result.id };
          }

          if (result.status !== "success") {
            const error = Boom.badRequest(result.status);
            error.output.payload.orderId = result.id;
            throw error;
          }

          return { message: "Success", orderId: result.id };
        }

        case "x2y2": {
          if (orderbook !== "reservoir") {
            throw new Error("Unsupported orderbook");
          }

          const orderInfo: orders.x2y2.OrderInfo = {
            orderParams: order.data,
            metadata: {
              schema,
            },
          };

          const [result] = await orders.x2y2.save([orderInfo]);

          if (result.status === "already-exists") {
            return { message: "Success", orderId: result.id };
          }

          if (result.status !== "success") {
            const error = Boom.badRequest(result.status);
            error.output.payload.orderId = result.id;
            throw error;
          }

          return { message: "Success", orderId: result.id };
        }
      }

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-order-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
