/* eslint-disable @typescript-eslint/no-explicit-any */

import { defaultAbiCoder } from "@ethersproject/abi";
import { splitSignature } from "@ethersproject/bytes";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { inject } from "@/api/index";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";

import * as postOrderExternal from "@/jobs/orderbook/post-order-external";
import { regex } from "@/common/utils";

const version = "v3";

export const postOrderV3Options: RouteOptions = {
  description: "Submit signed order",
  tags: ["api", "Orderbook"],
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
        kind: Joi.string()
          .lowercase()
          .valid(
            "opensea",
            "looks-rare",
            "zeroex-v4",
            "seaport",
            "seaport-forward",
            "x2y2",
            "universe",
            "forward",
            "infinity"
          )
          .required(),
        data: Joi.object().required(),
      }),
      orderbook: Joi.string()
        .lowercase()
        .valid("reservoir", "opensea", "looks-rare", "x2y2", "universe", "infinity")
        .default("reservoir"),
      orderbookApiKey: Joi.string().description("Optional API key for the target orderbook"),
      source: Joi.string().pattern(regex.domain).description("The source domain"),
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
  handler: async (request: Request) => {
    if (config.disableOrders) {
      throw Boom.badRequest("Order posting is disabled");
    }

    const payload = request.payload as any;
    const query = request.query as any;

    try {
      const order = payload.order;
      const orderbook = payload.orderbook;
      const orderbookApiKey = payload.orderbookApiKey || null;
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
            throw new Error("Unknown orderbook");
          }

          const orderInfo: orders.seaport.OrderInfo = {
            kind: "full",
            orderParams: order.data,
            isReservoir: orderbook === "reservoir",
            metadata: {
              schema,
              source: orderbook === "reservoir" ? source : undefined,
              target: orderbook,
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

          if (orderbook === "opensea") {
            await postOrderExternal.addToQueue(result.id, order.data, orderbook, orderbookApiKey);

            logger.info(
              `post-order-${version}-handler`,
              `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                result.id
              }`
            );
          }

          return { message: "Success", orderId: result.id };
        }

        case "seaport-forward": {
          if (!["opensea", "reservoir"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          const orderComponents = order.data as Sdk.Seaport.Types.OrderComponents;
          const tokenOffer = orderComponents.offer[0];

          // Forward EIP1271 signature
          orderComponents.signature = defaultAbiCoder.encode(
            [
              `tuple(
                uint8,
                address,
                uint256,
                uint256,
                uint256,
                uint256,
                uint256,
                tuple(uint256,address)[],
                bytes
              )`,
              "bytes",
            ],
            [
              [
                tokenOffer.itemType,
                tokenOffer.token,
                tokenOffer.identifierOrCriteria,
                tokenOffer.endAmount,
                orderComponents.startTime,
                orderComponents.endTime,
                orderComponents.salt,
                orderComponents.consideration.map(({ endAmount, recipient }) => [
                  endAmount,
                  recipient,
                ]),
                orderComponents.signature!,
              ],
              await inject({
                method: "GET",
                url: `/oracle/collections/floor-ask/v4?token=${tokenOffer.token}:${tokenOffer.identifierOrCriteria}`,
                headers: {
                  "Content-Type": "application/json",
                },
                payload: { order },
              })
                .then((response) => JSON.parse(response.payload))
                .then((response) =>
                  defaultAbiCoder.encode(
                    [
                      `tuple(
                        bytes32,
                        bytes,
                        uint256,
                        bytes
                      )`,
                    ],
                    [
                      [
                        response.message.id,
                        response.message.payload,
                        response.message.timestamp,
                        response.message.signature,
                      ],
                    ]
                  )
                ),
            ]
          );

          const orderInfo: orders.seaport.OrderInfo = {
            kind: "full",
            orderParams: orderComponents,
            isReservoir: orderbook === "reservoir",
            metadata: {
              schema,
              source: orderbook === "reservoir" ? source : undefined,
              target: orderbook,
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

          if (orderbook === "opensea") {
            await postOrderExternal.addToQueue(result.id, order.data, orderbook, orderbookApiKey);

            logger.info(
              `post-order-${version}-handler`,
              `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                result.id
              }`
            );
          }

          return { message: "Success", orderId: result.id };
        }

        case "looks-rare": {
          if (!["looks-rare", "reservoir"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          const orderInfo: orders.looksRare.OrderInfo = {
            orderParams: order.data,
            metadata: {
              schema,
              source: orderbook === "reservoir" ? source : undefined,
            },
          };

          const [result] = await orders.looksRare.save([orderInfo]);

          if (result.status === "already-exists") {
            return { message: "Success", orderId: result.id };
          }

          if (result.status !== "success") {
            const error = Boom.badRequest(result.status);
            error.output.payload.orderId = result.id;
            throw error;
          }

          if (orderbook === "looks-rare") {
            await postOrderExternal.addToQueue(result.id, order.data, orderbook, orderbookApiKey);

            logger.info(
              `post-order-${version}-handler`,
              `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                result.id
              }`
            );
          }

          return { message: "Success", orderId: result.id };
        }

        case "x2y2": {
          if (!["x2y2", "reservoir"].includes(orderbook)) {
            throw new Error("Unsupported orderbook");
          }

          if (orderbook === "x2y2") {
            // We do not save the order directly since X2Y2 orders are not fillable
            // unless their backend has processed them first. So we just need to be
            // patient until the relayer acknowledges the order (via X2Y2's server)
            // before us being able to ingest it.
            await postOrderExternal.addToQueue(null, order.data, orderbook, orderbookApiKey);
          } else {
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

          logger.info(
            `post-order-${version}-handler`,
            `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}`
          );

          return { message: "Success" };
        }

        case "universe": {
          if (!["universe"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          const orderInfo: orders.universe.OrderInfo = {
            orderParams: order.data,
            metadata: {
              schema,
              source: orderbook === "universe" ? source : undefined,
            },
          };

          const [result] = await orders.universe.save([orderInfo]);

          if (result.status === "already-exists") {
            return { message: "Success", orderId: result.id };
          }

          if (result.status !== "success") {
            throw Boom.badRequest(result.status);
          }

          if (orderbook === "universe") {
            await postOrderExternal.addToQueue(result.id, order.data, orderbook, orderbookApiKey);

            logger.info(
              `post-order-${version}-handler`,
              `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                result.id
              }`
            );
          }

          return { message: "Success", orderId: result.id };
        }

        case "infinity": {
          if (!["infinity"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          const orderInfo: orders.infinity.OrderInfo = {
            orderParams: order.data,
            metadata: {
              schema,
              source: orderbook === "infinity" ? source : undefined,
            },
          };

          const [result] = await orders.infinity.save([orderInfo]);

          if (result.status !== "success") {
            throw Boom.badRequest(result.status);
          }

          if (orderbook === "infinity") {
            await postOrderExternal.addToQueue(result.id, order.data, orderbook, orderbookApiKey);

            logger.info(
              `post-order-${version}-handler`,
              `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                result.id
              }`
            );
          }

          return { message: "Success", orderId: result.id };
        }

        case "forward": {
          if (!["reservoir"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          const orderInfo: orders.forward.OrderInfo = {
            orderParams: order.data,
            metadata: {
              schema,
              source,
            },
          };

          const [result] = await orders.forward.save([orderInfo]);

          if (result.status === "already-exists") {
            return { message: "Success", orderId: result.id };
          }

          if (result.status !== "success") {
            throw Boom.badRequest(result.status);
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
