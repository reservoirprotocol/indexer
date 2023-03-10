/* eslint-disable @typescript-eslint/no-explicit-any */

import { defaultAbiCoder } from "@ethersproject/abi";
import { splitSignature } from "@ethersproject/bytes";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import * as orders from "@/orderbook/orders";

import * as postOrderExternal from "@/jobs/orderbook/post-order-external";
import * as crossPostingOrdersModel from "@/models/cross-posting-orders";

const version = "v3";

export const postOrderV3Options: RouteOptions = {
  description: "Submit signed order",
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
        kind: Joi.string()
          .lowercase()
          .valid(
            "opensea",
            "looks-rare",
            "zeroex-v4",
            "seaport",
            "seaport-v1.4",
            "seaport-forward",
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
  response: {
    schema: Joi.object({
      message: Joi.string(),
      orderId: Joi.string().optional(),
      crossPostingOrderId: Joi.string()
        .optional()
        .description(
          "Only available when posting to external orderbook. Can be used to retrieve the status of a cross-post order."
        ),
    }).label(`getActivity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-activity-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
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

        case "seaport":
        case "seaport-v1.4": {
          if (!["opensea", "reservoir"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          let crossPostingOrder;

          const orderId =
            order.kind === "seaport"
              ? new Sdk.Seaport.Order(config.chainId, order.data).hash()
              : new Sdk.SeaportV14.Order(config.chainId, order.data).hash();

          if (orderbook === "opensea") {
            crossPostingOrder = await crossPostingOrdersModel.saveOrder({
              orderId,
              kind: order.kind,
              orderbook,
              source,
              schema,
              rawData: order.data,
            } as crossPostingOrdersModel.CrossPostingOrder);

            await postOrderExternal.addToQueue({
              crossPostingOrderId: crossPostingOrder.id,
              orderId,
              orderData: order.data,
              orderbook,
              orderbookApiKey,
              collectionId: collection,
            });
          } else if (config.forwardReservoirApiKeys.includes(request.headers["x-api-key"])) {
            const orderResult = await idb.oneOrNone(
              `
                SELECT
                  orders.token_set_id
                FROM orders
                WHERE orders.id = $/id/
              `,
              { id: orderId }
            );

            if (orderResult?.token_set_id?.startsWith("token")) {
              await postOrderExternal.addToQueue({
                orderId,
                orderData: order.data,
                orderbook: "opensea",
                orderbookApiKey: config.forwardOpenseaApiKey,
              });
            }
          } else {
            const [result] =
              order.kind === "seaport"
                ? await orders.seaport.save([
                    {
                      kind: "full",
                      orderParams: order.data,
                      isReservoir: true,
                      metadata: {
                        schema,
                        source,
                      },
                    },
                  ])
                : await orders.seaportV14.save([
                    {
                      kind: "full",
                      orderParams: order.data,
                      isReservoir: true,
                      metadata: {
                        schema,
                        source,
                      },
                    },
                  ]);

            if (!["success", "already-exists"].includes(result.status)) {
              const error = Boom.badRequest(result.status);
              error.output.payload.orderId = orderId;
              throw error;
            }

            const collectionResult = await idb.oneOrNone(
              `
                SELECT
                  collections.new_royalties,
                  orders.token_set_id
                FROM orders
                JOIN token_sets_tokens
                  ON orders.token_set_id = token_sets_tokens.token_set_id
                JOIN tokens
                  ON tokens.contract = token_sets_tokens.contract
                  AND tokens.token_id = token_sets_tokens.token_id
                JOIN collections
                  ON tokens.collection_id = collections.id
                WHERE orders.id = $/id/
                LIMIT 1
              `,
              { id: orderId }
            );

            if (
              collectionResult?.token_set_id?.startsWith("token") &&
              collectionResult?.new_royalties?.["opensea"]
            ) {
              const osRoyaltyRecipients = collectionResult.new_royalties["opensea"].map((r: any) =>
                r.recipient.toLowerCase()
              );
              const maker = order.data.offerer.toLowerCase();
              const consideration = order.data.consideration;

              let hasMarketplaceFee = false;
              for (const c of consideration) {
                const recipient = c.recipient.toLowerCase();
                if (recipient !== maker && !osRoyaltyRecipients.includes(recipient)) {
                  hasMarketplaceFee = true;
                }
              }

              if (!hasMarketplaceFee) {
                await postOrderExternal.addToQueue({
                  orderId,
                  orderData: order.data,
                  orderbook: "opensea",
                  orderbookApiKey: config.openSeaApiKey,
                  collectionId: collection,
                });
              }
            }
          }

          return { message: "Success", orderId, crossPostingOrderId: crossPostingOrder?.id };
        }

        case "seaport-forward": {
          if (!["opensea", "reservoir"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          let crossPostingOrder;

          const orderId = new Sdk.Seaport.Order(config.chainId, order.data).hash();

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

          if (orderbook === "opensea") {
            crossPostingOrder = await crossPostingOrdersModel.saveOrder({
              orderId,
              kind: order.kind,
              orderbook,
              source,
              schema,
              rawData: order.data,
            } as crossPostingOrdersModel.CrossPostingOrder);

            await postOrderExternal.addToQueue({
              crossPostingOrderId: crossPostingOrder.id,
              orderId,
              orderData: order.data,
              orderbook,
              orderbookApiKey,
              collectionId: collection,
            });
          } else {
            const [result] = await orders.seaport.save([
              {
                kind: "full",
                orderParams: order.data,
                isReservoir: true,
                metadata: {
                  schema,
                  source,
                },
              },
            ]);

            if (!["success", "already-exists"].includes(result.status)) {
              const error = Boom.badRequest(result.status);
              error.output.payload.orderId = orderId;
              throw error;
            }
          }

          return { message: "Success", orderId, crossPostingOrderId: crossPostingOrder?.id };
        }

        case "looks-rare": {
          if (!["looks-rare", "reservoir"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          let crossPostingOrder;

          const orderId = new Sdk.LooksRare.Order(
            config.chainId,
            order.data as Sdk.LooksRare.Types.MakerOrderParams
          ).hash();

          if (orderbook === "looks-rare") {
            crossPostingOrder = await crossPostingOrdersModel.saveOrder({
              orderId,
              kind: order.kind,
              orderbook,
              source,
              schema,
              rawData: order.data,
            } as crossPostingOrdersModel.CrossPostingOrder);

            await postOrderExternal.addToQueue({
              crossPostingOrderId: crossPostingOrder.id,
              orderId,
              orderData: order.data,
              orderbook,
              orderbookApiKey,
              collectionId: collection,
            });
          } else {
            const orderInfo: orders.looksRare.OrderInfo = {
              orderParams: order.data,
              metadata: {
                schema,
                source,
              },
            };

            const [result] = await orders.looksRare.save([orderInfo]);

            if (!["success", "already-exists"].includes(result.status)) {
              const error = Boom.badRequest(result.status);
              error.output.payload.orderId = orderId;
              throw error;
            }
          }

          return { message: "Success", orderId, crossPostingOrderId: crossPostingOrder?.id };
        }

        case "x2y2": {
          if (!["x2y2", "reservoir"].includes(orderbook)) {
            throw new Error("Unsupported orderbook");
          }

          let crossPostingOrder;

          const orderId = null;

          if (orderbook === "x2y2") {
            // We do not save the order directly since X2Y2 orders are not fillable
            // unless their backend has processed them first. So we just need to be
            // patient until the relayer acknowledges the order (via X2Y2's server)
            // before us being able to ingest it.
            crossPostingOrder = await crossPostingOrdersModel.saveOrder({
              orderId,
              kind: order.kind,
              orderbook,
              source,
              schema,
              rawData: order.data,
            } as crossPostingOrdersModel.CrossPostingOrder);

            await postOrderExternal.addToQueue({
              crossPostingOrderId: crossPostingOrder.id,
              orderId,
              orderData: order.data,
              orderbook,
              orderbookApiKey,
              collectionId: collection,
            });
          } else {
            const [result] = await orders.x2y2.save([
              {
                orderParams: order.data,
                metadata: {
                  schema,
                },
              },
            ]);

            if (!["success", "already-exists"].includes(result.status)) {
              const error = Boom.badRequest(result.status);
              error.output.payload.orderId = result.id;
              throw error;
            }
          }

          return { message: "Success", orderId, crossPostingOrderId: crossPostingOrder?.id };
        }

        case "universe": {
          if (!["universe"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          const orderId = new Sdk.Universe.Order(config.chainId, order.data).hashOrderKey();

          const crossPostingOrder = await crossPostingOrdersModel.saveOrder({
            orderId,
            kind: order.kind,
            orderbook,
            source,
            schema,
            rawData: order.data,
          } as crossPostingOrdersModel.CrossPostingOrder);

          await postOrderExternal.addToQueue({
            crossPostingOrderId: crossPostingOrder.id,
            orderId,
            orderData: order.data,
            orderbook,
            orderbookApiKey,
            collectionId: collection,
          });

          return { message: "Success", orderId, crossPostingOrderId: crossPostingOrder.id };
        }

        case "infinity": {
          if (!["infinity"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          const orderId = new Sdk.Infinity.Order(config.chainId, order.data).hash();

          const crossPostingOrder = await crossPostingOrdersModel.saveOrder({
            orderId,
            kind: order.kind,
            orderbook,
            source,
            schema,
            rawData: order.data,
          } as crossPostingOrdersModel.CrossPostingOrder);

          await postOrderExternal.addToQueue({
            crossPostingOrderId: crossPostingOrder.id,
            orderId,
            orderData: order.data,
            orderbook,
            orderbookApiKey,
            collectionId: collection,
          });

          return { message: "Success", orderId, crossPostingOrderId: crossPostingOrder.id };
        }

        case "flow": {
          if (!["flow"].includes(orderbook)) {
            throw new Error("Unknown orderbook");
          }

          const orderId = new Sdk.Flow.Order(config.chainId, order.data).hash();

          const crossPostingOrder = await crossPostingOrdersModel.saveOrder({
            orderId,
            kind: order.kind,
            orderbook,
            source,
            schema,
            rawData: order.data,
          } as crossPostingOrdersModel.CrossPostingOrder);

          await postOrderExternal.addToQueue({
            crossPostingOrderId: crossPostingOrder.id,
            orderId,
            orderData: order.data,
            orderbook,
            orderbookApiKey,
            collectionId: collection,
          });

          return { message: "Success", orderId, crossPostingOrderId: crossPostingOrder.id };
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

      throw Boom.badImplementation("Unreachable");
    } catch (error) {
      logger.error(`post-order-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
