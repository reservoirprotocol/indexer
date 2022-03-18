/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import axios from "axios";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as wyvernV23 from "@/orderbook/orders/wyvern-v2.3";

const version = "v1";

export const postOrderV1Options: RouteOptions = {
  description: "Publish a single order",
  tags: ["api", "1. Order Book"],
  plugins: {
    "hapi-swagger": {
      order: 4,
    },
  },
  validate: {
    payload: Joi.object({
      order: Joi.object({
        kind: Joi.string().lowercase().valid("wyvern-v2.3").required(),
        data: Joi.object().required(),
      }),
      orderbook: Joi.string()
        .lowercase()
        .valid("reservoir", "opensea")
        .default("reservoir"),
      source: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      attribute: Joi.object({
        collection: Joi.string().required(),
        key: Joi.string().required(),
        value: Joi.string().required(),
      }),
    }),
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const order = payload.order;
      const orderbook = payload.orderbook;
      const source = payload.source;
      const attribute = payload.attribute;

      switch (order.kind) {
        case "wyvern-v2.3": {
          switch (orderbook) {
            case "reservoir": {
              const orderInfo: wyvernV23.OrderInfo = {
                orderParams: order.data,
                metadata: {
                  schema: attribute && {
                    kind: "attribute",
                    data: {
                      collection: attribute.collection,
                      attributes: [
                        {
                          key: attribute.key,
                          value: attribute.value,
                        },
                      ],
                    },
                  },
                  source,
                },
              };
              const [result] = await wyvernV23.save([orderInfo]);
              if (result.status === "success") {
                return { message: "Success" };
              } else {
                throw Boom.badRequest(result.status);
              }
            }

            case "opensea": {
              const sdkOrder = new Sdk.WyvernV23.Order(
                config.chainId,
                order.data
              );
              const orderInfo = sdkOrder.getInfo();
              if (!orderInfo) {
                throw Boom.badData("Could not parse order");
              }

              // For now, OpenSea only supports single-token orders
              if (!(orderInfo as any).tokenId) {
                throw Boom.badData("Unsupported order kind");
              }

              const osOrder = {
                ...order.params,
                makerProtocolFee: "0",
                takerProtocolFee: "0",
                makerReferrerFee: "0",
                feeMethod: 1,
                quantity: "1",
                metadata: {
                  asset: {
                    id: (orderInfo as any).tokenId,
                    address: orderInfo.contract,
                  },
                  schema: sdkOrder.params.kind?.startsWith("erc721")
                    ? "ERC721"
                    : "ERC1155",
                },
                hash: sdkOrder.hash(),
              };

              // Post order to OpenSea
              await axios
                .post(
                  `https://${
                    config.chainId === 4 ? "testnets-api." : "api."
                  }opensea.io/wyvern/v1/orders/post`,
                  JSON.stringify(osOrder),
                  {
                    headers:
                      config.chainId === 1
                        ? {
                            "Content-Type": "application/json",
                            "X-Api-Key": String(process.env.OPENSEA_API_KEY),
                          }
                        : {
                            "Content-Type": "application/json",
                            // The request will fail if passing the API key on Rinkeby
                          },
                  }
                )
                .catch((error) => {
                  if (error.response) {
                    logger.error(
                      `post-orders-${version}-handler`,
                      `Failed to post order to OpenSea: ${JSON.stringify(
                        error.response.data
                      )}`
                    );
                  }

                  throw Boom.badRequest(error.response.data);
                });

              break;
            }

            default: {
              throw Boom.badData("Unknown orderbook");
            }
          }

          break;
        }
      }

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(
        `post-orders-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
