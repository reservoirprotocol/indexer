/* eslint-disable @typescript-eslint/no-explicit-any */

import { splitSignature } from "@ethersproject/bytes";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";

import Joi from "joi";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";

import * as postOrderExternal from "@/jobs/orderbook/post-order-external";

const version = "v4";

export const postOrderV4Options: RouteOptions = {
  description: "Submit signed orders",
  tags: ["api", "Orderbook"],
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  validate: {
    query: Joi.object({
      signature: Joi.string().lowercase().pattern(regex.bytes),
    }),
    payload: Joi.object({
      items: Joi.array()
        .items(
          Joi.object({
            order: Joi.object({
              kind: Joi.string()
                .lowercase()
                .valid(
                  "opensea",
                  "looks-rare",
                  "zeroex-v4",
                  "seaport",
                  "seaport-v1.4",
                  "x2y2",
                  "universe",
                  "forward",
                  "infinity",
                  "flow"
                )
                .required(),
              data: Joi.object().required(),
            }),
            orderbook: Joi.string()
              .lowercase()
              .valid("reservoir", "opensea", "looks-rare", "x2y2", "universe", "infinity", "flow")
              .default("reservoir"),
            orderbookApiKey: Joi.string().description("Optional API key for the target orderbook"),
            attribute: Joi.object({
              collection: Joi.string().required(),
              key: Joi.string().required(),
              value: Joi.string().required(),
            }),
            collection: Joi.string(),
            tokenSetId: Joi.string(),
            isNonFlagged: Joi.boolean(),
            bulkData: Joi.object({
              kind: "seaport-v1.4",
              data: Joi.object({
                orderIndex: Joi.number().required(),
                merkleProof: Joi.array().items(Joi.string()).required(),
              }),
            }),
          }).oxor("tokenSetId", "collection", "attribute")
        )
        .min(1),
      source: Joi.string().pattern(regex.domain).description("The source domain"),
    }),
  },
  handler: async (request: Request) => {
    if (config.disableOrders) {
      throw Boom.badRequest("Order posting is disabled");
    }

    const payload = request.payload as any;
    const query = request.query as any;

    try {
      const items = payload.items as {
        order: { kind: string; data: any };
        orderbook: string;
        orderbookApiKey?: string;
        attribute?: { collection: string; key: string; value: string };
        collection?: string;
        tokenSetId?: string;
        isNonFlagged?: boolean;
        source?: string;
        bulkData?: {
          kind: "seaport-v1.4";
          data: {
            orderIndex: number;
            merkleProof: string[];
          };
        };
      }[];

      // Only Seaport v1.3 supports bulk orders
      if (items.length > 1) {
        if (!items.every((item) => item.order.kind === "seaport-v1.4")) {
          throw Boom.badRequest("Bulk orders are only supported on Seaport v1.3");
        }
      }

      const results: { message: string; orderIndex: number; orderId?: string }[] = [];
      await Promise.all(
        items.map(async (item, i) => {
          const source = payload.source;
          const order = item.order;
          const orderbook = item.orderbook;
          const orderbookApiKey = item.orderbookApiKey ?? null;
          const bulkData = item.bulkData;

          // We'll always have only one of the below cases:
          // - only relevant/present for attribute bids
          const attribute = item.attribute;
          // - only relevant for collection bids
          const collection = item.collection;
          // - only relevant for token set bids
          const tokenSetId = item.tokenSetId;

          // - only relevant for non-flagged tokens bids
          const isNonFlagged = item.isNonFlagged;

          const signature = query.signature ?? order.data.signature;
          if (signature) {
            const { v, r, s } = splitSignature(signature);

            if (bulkData?.kind === "seaport-v1.4") {
              // Encode the merkle proof of inclusion together with the signature
              order.data.signature = new Sdk.SeaportV14.Exchange(
                config.chainId
              ).encodeBulkOrderProofAndSignature(
                bulkData.data.orderIndex,
                bulkData.data.merkleProof,
                signature
              );
            } else {
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
                return results.push({ message: "unsupported-orderbook", orderIndex: i });
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
                return results.push({ message: "unauthorized", orderIndex: i });
              }

              const [result] = await orders.zeroExV4.save([orderInfo]);

              if (["already-exists", "success"].includes(result.status)) {
                return results.push({ message: "success", orderIndex: i, orderId: result.id });
              } else {
                return results.push({ message: result.status, orderIndex: i, orderId: result.id });
              }
            }

            case "seaport": {
              if (!["opensea", "reservoir"].includes(orderbook)) {
                return results.push({ message: "unsupported-orderbook", orderIndex: i });
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
                return results.push({ message: "success", orderIndex: i, orderId: result.id });
              } else if (result.status !== "success") {
                return results.push({ message: result.status, orderIndex: i, orderId: result.id });
              }

              if (orderbook === "opensea") {
                await postOrderExternal.addToQueue(
                  result.id,
                  order.data,
                  orderbook,
                  orderbookApiKey
                );

                logger.info(
                  `post-order-${version}-handler`,
                  `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                    result.id
                  }`
                );
              } else if (config.forwardReservoirApiKeys.includes(request.headers["x-api-key"])) {
                const orderResult = await idb.oneOrNone(
                  `
                    SELECT
                      orders.token_set_id
                    FROM orders
                    WHERE orders.id = $/id/
                  `,
                  { id: result.id }
                );
                if (orderResult?.token_set_id?.startsWith("token")) {
                  await postOrderExternal.addToQueue(
                    result.id,
                    order.data,
                    "opensea",
                    config.forwardOpenseaApiKey
                  );

                  logger.info(
                    `post-order-${version}-handler`,
                    JSON.stringify({
                      forward: true,
                      orderbook: "opensea",
                      data: order.data,
                      orderId: result.id,
                    })
                  );
                }
              }

              return results.push({ message: "success", orderIndex: i, orderId: result.id });
            }

            case "seaport-v1.4": {
              if (!["opensea", "reservoir"].includes(orderbook)) {
                return results.push({ message: "unsupported-orderbook", orderIndex: i });
              }

              const orderInfo: orders.seaportV14.OrderInfo = {
                kind: "full",
                orderParams: order.data,
                isReservoir: orderbook === "reservoir",
                metadata: {
                  schema,
                  source: orderbook === "reservoir" ? source : undefined,
                  target: orderbook,
                },
              };

              const [result] = await orders.seaportV14.save([orderInfo]);

              if (result.status === "already-exists") {
                return results.push({ message: "success", orderIndex: i, orderId: result.id });
              } else if (result.status !== "success") {
                return results.push({ message: result.status, orderIndex: i, orderId: result.id });
              }

              if (orderbook === "opensea") {
                await postOrderExternal.addToQueue(
                  result.id,
                  order.data,
                  orderbook,
                  orderbookApiKey
                );

                logger.info(
                  `post-order-${version}-handler`,
                  `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                    result.id
                  }`
                );
              } else if (config.forwardReservoirApiKeys.includes(request.headers["x-api-key"])) {
                const orderResult = await idb.oneOrNone(
                  `
                    SELECT
                      orders.token_set_id
                    FROM orders
                    WHERE orders.id = $/id/
                  `,
                  { id: result.id }
                );
                if (orderResult?.token_set_id?.startsWith("token")) {
                  await postOrderExternal.addToQueue(
                    result.id,
                    order.data,
                    "opensea",
                    config.forwardOpenseaApiKey
                  );

                  logger.info(
                    `post-order-${version}-handler`,
                    JSON.stringify({
                      forward: true,
                      orderbook: "opensea",
                      data: order.data,
                      orderId: result.id,
                    })
                  );
                }
              }

              return results.push({ message: "success", orderIndex: i, orderId: result.id });
            }

            case "looks-rare": {
              if (!["looks-rare", "reservoir"].includes(orderbook)) {
                return results.push({ message: "unsupported-orderbook", orderIndex: i });
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
                return results.push({ message: "success", orderIndex: i, orderId: result.id });
              } else if (result.status !== "success") {
                return results.push({ message: result.status, orderIndex: i, orderId: result.id });
              }

              if (orderbook === "looks-rare") {
                await postOrderExternal.addToQueue(
                  result.id,
                  order.data,
                  orderbook,
                  orderbookApiKey
                );

                logger.info(
                  `post-order-${version}-handler`,
                  `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                    result.id
                  }`
                );
              }

              return results.push({ message: "success", orderIndex: i, orderId: result.id });
            }

            case "x2y2": {
              if (!["x2y2", "reservoir"].includes(orderbook)) {
                return results.push({ message: "unsupported-orderbook", orderIndex: i });
              }

              if (orderbook === "x2y2") {
                // We do not save the order directly since X2Y2 orders are not fillable
                // unless their backend has processed them first. So we just need to be
                // patient until the relayer acknowledges the order (via X2Y2's server)
                // before us being able to ingest it.
                await postOrderExternal.addToQueue(null, order.data, orderbook, orderbookApiKey);

                logger.info(
                  `post-order-${version}-handler`,
                  `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}`
                );

                return results.push({ message: "success", orderIndex: i });
              } else {
                const orderInfo: orders.x2y2.OrderInfo = {
                  orderParams: order.data,
                  metadata: {
                    schema,
                  },
                };

                const [result] = await orders.x2y2.save([orderInfo]);

                if (["already-exists", "success"].includes(result.status)) {
                  return results.push({ message: "success", orderIndex: i, orderId: result.id });
                } else {
                  return results.push({
                    message: result.status,
                    orderIndex: i,
                    orderId: result.id,
                  });
                }
              }
            }

            case "universe": {
              if (!["universe"].includes(orderbook)) {
                return results.push({ message: "unsupported-orderbook", orderIndex: i });
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
                return results.push({ message: "success", orderIndex: i, orderId: result.id });
              } else if (result.status !== "success") {
                return results.push({ message: result.status, orderIndex: i, orderId: result.id });
              }

              if (orderbook === "universe") {
                await postOrderExternal.addToQueue(
                  result.id,
                  order.data,
                  orderbook,
                  orderbookApiKey
                );

                logger.info(
                  `post-order-${version}-handler`,
                  `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                    result.id
                  }`
                );
              }

              return results.push({ message: "success", orderIndex: i, orderId: result.id });
            }

            case "infinity": {
              if (!["infinity"].includes(orderbook)) {
                return results.push({ message: "unsupported-orderbook", orderIndex: i });
              }

              const orderInfo: orders.infinity.OrderInfo = {
                orderParams: order.data,
                metadata: {
                  schema,
                  source: orderbook === "infinity" ? source : undefined,
                },
              };

              const [result] = await orders.infinity.save([orderInfo]);

              if (result.status === "already-exists") {
                return results.push({ message: "success", orderIndex: i, orderId: result.id });
              } else if (result.status !== "success") {
                return results.push({ message: result.status, orderIndex: i, orderId: result.id });
              }

              if (orderbook === "infinity") {
                await postOrderExternal.addToQueue(
                  result.id,
                  order.data,
                  orderbook,
                  orderbookApiKey
                );

                logger.info(
                  `post-order-${version}-handler`,
                  `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                    result.id
                  }`
                );
              }

              return results.push({ message: "success", orderIndex: i, orderId: result.id });
            }

            case "flow": {
              if (!["flow"].includes(orderbook)) {
                return results.push({ message: "unsupported-orderbook", orderIndex: i });
              }

              const orderInfo: orders.flow.OrderInfo = {
                orderParams: order.data,
                metadata: {
                  schema,
                  source: orderbook === "flow" ? source : undefined,
                },
              };

              const [result] = await orders.flow.save([orderInfo]);

              if (result.status === "already-exists") {
                return results.push({ message: "success", orderIndex: i, orderId: result.id });
              } else if (result.status !== "success") {
                return results.push({ message: result.status, orderIndex: i, orderId: result.id });
              }

              if (orderbook === "flow") {
                await postOrderExternal.addToQueue(
                  result.id,
                  order.data,
                  orderbook,
                  orderbookApiKey
                );

                logger.info(
                  `post-order-${version}-handler`,
                  `orderbook: ${orderbook}, orderData: ${JSON.stringify(order.data)}, orderId: ${
                    result.id
                  }`
                );
              }

              return results.push({ message: "success", orderIndex: i, orderId: result.id });
            }
          }
        })
      );

      return { results };
    } catch (error) {
      logger.error(`post-order-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
