/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";
import _ from "lodash";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, regex } from "@/common/utils";
import { config } from "@/config/index";

// LooksRare
import * as looksRareBuyToken from "@/orderbook/orders/looks-rare/build/buy/token";
import * as looksRareBuyCollection from "@/orderbook/orders/looks-rare/build/buy/collection";

// OpenDao
import * as openDaoBuyAttribute from "@/orderbook/orders/opendao/build/buy/attribute";
import * as openDaoBuyToken from "@/orderbook/orders/opendao/build/buy/token";
import * as openDaoBuyCollection from "@/orderbook/orders/opendao/build/buy/collection";

// Seaport
import * as seaportBuyAttribute from "@/orderbook/orders/seaport/build/buy/attribute";
import * as seaportBuyToken from "@/orderbook/orders/seaport/build/buy/token";
import * as seaportBuyCollection from "@/orderbook/orders/seaport/build/buy/collection";

// X2Y2
import * as x2y2BuyCollection from "@/orderbook/orders/x2y2/build/buy/collection";
import * as x2y2BuyToken from "@/orderbook/orders/x2y2/build/buy/token";

// ZeroExV4
import * as zeroExV4BuyAttribute from "@/orderbook/orders/zeroex-v4/build/buy/attribute";
import * as zeroExV4BuyToken from "@/orderbook/orders/zeroex-v4/build/buy/token";
import * as zeroExV4BuyCollection from "@/orderbook/orders/zeroex-v4/build/buy/collection";

const version = "v3";

export const getExecuteBidV3Options: RouteOptions = {
  description: "Create bid (offer)",
  notes: "Generate a bid and submit it to multiple marketplaces",
  timeout: { server: 60000 },
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    payload: Joi.object({
      maker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Address of wallet making the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        )
        .required(),
      source: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .description("Domain of the platform that created the order. Example: `chimpers.xyz`"),
      params: Joi.array().items(
        Joi.object({
          token: Joi.string()
            .lowercase()
            .pattern(regex.token)
            .description(
              "Bid on a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
            ),
          tokenSetId: Joi.string().lowercase().description("Bid on a particular token set."),
          collection: Joi.string()
            .lowercase()
            .description(
              "Bid on a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            ),
          attributeKey: Joi.string().description(
            "Bid on a particular attribute key. Example: `Composition`"
          ),
          attributeValue: Joi.string().description(
            "Bid on a particular attribute value. Example: `Teddy (#33)`"
          ),
          quantity: Joi.number().description(
            "Quanity of tokens user is buying. Only compatible with ERC1155 tokens. Example: `5`"
          ),
          weiPrice: Joi.string()
            .pattern(regex.number)
            .description("Amount bidder is willing to offer in wei. Example: `1000000000000000000`")
            .required(),
          orderKind: Joi.string()
            .valid("721ex", "zeroex-v4", "seaport", "looks-rare", "x2y2")
            .default("seaport")
            .description("Exchange protocol used to create order. Example: `seaport`"),
          orderbook: Joi.string()
            .valid("reservoir", "opensea", "looks-rare", "x2y2")
            .default("reservoir")
            .description("Orderbook where order is placed. Example: `Reservoir`"),
          automatedRoyalties: Joi.boolean()
            .default(true)
            .description("If true, royalties will be automatically included."),
          fee: Joi.alternatives(Joi.string().pattern(regex.number), Joi.number()).description(
            "Fee amount in BPS. Example: `100`"
          ),
          excludeFlaggedTokens: Joi.boolean()
            .default(false)
            .description("If true flagged tokens will be excluded"),
          feeRecipient: Joi.string()
            .lowercase()
            .pattern(regex.address)
            .description(
              "Wallet address of fee recipient. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
            )
            .disallow(AddressZero),
          listingTime: Joi.string()
            .pattern(regex.unixTimestamp)
            .description(
              "Unix timestamp (seconds) indicating when listing will be listed. Example: `1656080318`"
            ),
          expirationTime: Joi.string()
            .pattern(regex.unixTimestamp)
            .description(
              "Unix timestamp (seconds) indicating when listing will expire. Example: `1656080318`"
            ),
          salt: Joi.string()
            .pattern(regex.number)
            .description("Optional. Random string to make the order unique"),
          nonce: Joi.string().pattern(regex.number).description("Optional. Set a custom nonce"),
        })
          .or("token", "collection", "tokenSetId")
          .oxor("token", "collection", "tokenSetId")
          .with("attributeValue", "attributeKey")
          .with("attributeKey", "attributeValue")
          .with("attributeKey", "collection")
          .with("feeRecipient", "fee")
          .with("fee", "feeRecipient")
      ),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          kind: Joi.string().valid("request", "signature", "transaction").required(),
          action: Joi.string().required(),
          description: Joi.string().required(),
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
      query: Joi.object(),
    }).label(`getExecuteBid${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-bid-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    try {
      const maker = payload.maker;
      const source = payload.source;

      // Set up generic bid steps
      const steps: {
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          data?: any;
          orderIndex?: number;
        }[];
      }[] = [
        {
          action: "Wrapping ETH",
          description: "We'll ask your approval for converting ETH to WETH. Gas fee required.",
          kind: "transaction",
          items: [],
        },
        {
          action: "Approve WETH contract",
          description:
            "We'll ask your approval for the exchange to access your token. This is a one-time only operation per exchange.",
          kind: "transaction",
          items: [],
        },
        {
          action: "Authorize offer",
          description: "A free off-chain signature to create the offer",
          kind: "signature",
          items: [],
        },
      ];

      for (let i = 0; i < payload.params.length; i++) {
        const params = payload.params[i];

        const token = params.token;
        const collection = params.collection;
        const tokenSetId = params.tokenSetId;
        const attributeKey = params.attributeKey;
        const attributeValue = params.attributeValue;

        // TODO: Re-enable collection/attribute bids on external orderbooks
        if (!token && params.orderbook !== "reservoir") {
          throw Boom.badRequest("Only single-token bids are supported on external orderbooks");
        }

        // On Rinkeby, proxy ZeroEx V4 to 721ex
        if (params.orderKind === "zeroex-v4" && config.chainId === 4) {
          params.orderKind = "721ex";
        }

        // Check the maker's Weth/Eth balance
        let wrapEthTx: TxData | undefined;
        const weth = new Sdk.Common.Helpers.Weth(baseProvider, config.chainId);
        const wethBalance = await weth.getBalance(maker);
        if (bn(wethBalance).lt(params.weiPrice)) {
          const ethBalance = await baseProvider.getBalance(maker);
          if (bn(wethBalance).add(ethBalance).lt(params.weiPrice)) {
            throw Boom.badData("Maker does not have sufficient balance");
          } else {
            wrapEthTx = weth.depositTransaction(maker, bn(params.weiPrice).sub(wethBalance));
          }
        }

        switch (params.orderKind) {
          case "seaport": {
            if (!["reservoir", "opensea"].includes(params.orderbook)) {
              throw Boom.badRequest("Unsupported orderbook");
            }

            // We want the fee params as arrays
            if (params.fee && !Array.isArray(params.fee)) {
              params.fee = [params.fee];
            }
            if (params.feeRecipient && !Array.isArray(params.feeRecipient)) {
              params.feeRecipient = [params.feeRecipient];
            }
            if (params.fee?.length !== params.feeRecipient?.length) {
              throw Boom.badRequest("Invalid fee info");
            }

            let order: Sdk.Seaport.Order;
            if (token) {
              const [contract, tokenId] = token.split(":");
              order = await seaportBuyToken.build({
                ...params,
                maker,
                contract,
                tokenId,
              });
            } else if (tokenSetId || (collection && attributeKey && attributeValue)) {
              order = await seaportBuyAttribute.build({
                ...params,
                maker,
                collection,
                attributes: [
                  {
                    key: attributeKey,
                    value: attributeValue,
                  },
                ],
              });
            } else if (collection) {
              order = await seaportBuyCollection.build({
                ...params,
                maker,
                collection,
              });
            } else {
              throw Boom.internal("Wrong metadata");
            }

            const exchange = new Sdk.Seaport.Exchange(config.chainId);
            const conduit = exchange.deriveConduit(order.params.conduitKey);

            // Check the maker's WETH approval
            let approvalTx: TxData | undefined;
            const wethApproval = await weth.getAllowance(maker, conduit);
            if (bn(wethApproval).lt(order.getMatchingPrice())) {
              approvalTx = weth.approveTransaction(maker, conduit);
            }

            steps[0].items.push({
              status: !wrapEthTx ? "complete" : "incomplete",
              data: wrapEthTx,
              orderIndex: i,
            });
            steps[1].items.push({
              status: !approvalTx ? "complete" : "incomplete",
              data: approvalTx,
              orderIndex: i,
            });
            steps[2].items.push({
              status: "incomplete",
              data: {
                sign: order.getSignatureData(),
                post: {
                  endpoint: "/order/v3",
                  method: "POST",
                  body: {
                    order: {
                      kind: "seaport",
                      data: {
                        ...order.params,
                      },
                    },
                    tokenSetId,
                    attribute:
                      collection && attributeKey && attributeValue
                        ? {
                            collection,
                            key: attributeKey,
                            value: attributeValue,
                          }
                        : undefined,
                    collection:
                      collection && params.excludeFlaggedTokens && !attributeKey && !attributeValue
                        ? collection
                        : undefined,
                    isNonFlagged: params.excludeFlaggedTokens,
                    orderbook: params.orderbook,
                    source,
                  },
                },
              },
              orderIndex: i,
            });

            // Go on with the next bid
            continue;
          }

          case "721ex": {
            if (!["reservoir"].includes(params.orderbook)) {
              throw Boom.badRequest("Unsupported orderbook");
            }

            // Make sure the fee information is correctly typed
            if (params.fee && !Array.isArray(params.fee)) {
              params.fee = [params.fee];
            }
            if (params.feeRecipient && !Array.isArray(params.feeRecipient)) {
              params.feeRecipient = [params.feeRecipient];
            }
            if (params.fee?.length !== params.feeRecipient?.length) {
              throw Boom.badRequest("Invalid fee information");
            }

            let order: Sdk.OpenDao.Order | undefined;
            if (token) {
              const [contract, tokenId] = token.split(":");
              order = await openDaoBuyToken.build({
                ...params,
                maker,
                contract,
                tokenId,
              });
            } else if (tokenSetId || (collection && attributeKey && attributeValue)) {
              order = await openDaoBuyAttribute.build({
                ...params,
                maker,
                collection,
                attributes: [
                  {
                    key: attributeKey,
                    value: attributeValue,
                  },
                ],
              });
            } else if (collection) {
              order = await openDaoBuyCollection.build({
                ...params,
                maker,
                collection,
              });
            }

            if (!order) {
              throw Boom.internal("Failed to generate order");
            }

            // Check the maker's approval
            let approvalTx: TxData | undefined;
            const wethApproval = await weth.getAllowance(
              maker,
              Sdk.OpenDao.Addresses.Exchange[config.chainId]
            );
            if (bn(wethApproval).lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))) {
              approvalTx = weth.approveTransaction(
                maker,
                Sdk.OpenDao.Addresses.Exchange[config.chainId]
              );
            }

            steps[0].items.push({
              status: !wrapEthTx ? "complete" : "incomplete",
              data: wrapEthTx,
              orderIndex: i,
            });
            steps[1].items.push({
              status: !approvalTx ? "complete" : "incomplete",
              data: approvalTx,
              orderIndex: i,
            });
            steps[2].items.push({
              status: "incomplete",
              data: {
                sign: order.getSignatureData(),
                post: {
                  endpoint: "/order/v3",
                  method: "POST",
                  body: {
                    order: {
                      kind: "721ex",
                      data: {
                        ...order.params,
                      },
                    },
                    tokenSetId,
                    attribute:
                      collection && attributeKey && attributeValue
                        ? {
                            collection,
                            key: attributeKey,
                            value: attributeValue,
                          }
                        : undefined,
                    collection:
                      collection && params.excludeFlaggedTokens && !attributeKey && !attributeValue
                        ? collection
                        : undefined,
                    isNonFlagged: params.excludeFlaggedTokens,
                    orderbook: params.orderbook,
                    source,
                  },
                },
              },
              orderIndex: i,
            });

            // Go on with the next bid
            continue;
          }

          case "zeroex-v4": {
            if (!["reservoir"].includes(params.orderbook)) {
              throw Boom.badRequest("Unsupported orderbook");
            }

            // Make sure the fee information is correctly typed
            if (params.fee && !Array.isArray(params.fee)) {
              params.fee = [params.fee];
            }
            if (params.feeRecipient && !Array.isArray(params.feeRecipient)) {
              params.feeRecipient = [params.feeRecipient];
            }
            if (params.fee?.length !== params.feeRecipient?.length) {
              throw Boom.badRequest("Invalid fee information");
            }

            let order: Sdk.ZeroExV4.Order | undefined;
            if (token) {
              const [contract, tokenId] = token.split(":");
              order = await zeroExV4BuyToken.build({
                ...params,
                maker,
                contract,
                tokenId,
              });
            } else if (tokenSetId || (collection && attributeKey && attributeValue)) {
              order = await zeroExV4BuyAttribute.build({
                ...params,
                maker,
                collection,
                attributes: [
                  {
                    key: attributeKey,
                    value: attributeValue,
                  },
                ],
              });
            } else if (collection) {
              order = await zeroExV4BuyCollection.build({
                ...params,
                maker,
                collection,
              });
            }

            if (!order) {
              throw Boom.internal("Failed to generate order");
            }

            // Check the maker's approval
            let approvalTx: TxData | undefined;
            const wethApproval = await weth.getAllowance(
              maker,
              Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
            );
            if (bn(wethApproval).lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))) {
              approvalTx = weth.approveTransaction(
                maker,
                Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
              );
            }

            steps[0].items.push({
              status: !wrapEthTx ? "complete" : "incomplete",
              data: wrapEthTx,
              orderIndex: i,
            });
            steps[1].items.push({
              status: !approvalTx ? "complete" : "incomplete",
              data: approvalTx,
              orderIndex: i,
            });
            steps[2].items.push({
              status: "incomplete",
              data: {
                sign: order.getSignatureData(),
                post: {
                  endpoint: "/order/v3",
                  method: "POST",
                  body: {
                    order: {
                      kind: "zeroex-v4",
                      data: {
                        ...order.params,
                      },
                    },
                    tokenSetId,
                    attribute:
                      collection && attributeKey && attributeValue
                        ? {
                            collection,
                            key: attributeKey,
                            value: attributeValue,
                          }
                        : undefined,
                    collection:
                      collection && params.excludeFlaggedTokens && !attributeKey && !attributeValue
                        ? collection
                        : undefined,
                    isNonFlagged: params.excludeFlaggedTokens,
                    orderbook: params.orderbook,
                    source,
                  },
                },
              },
              orderIndex: i,
            });

            // Go on with the next bid
            continue;
          }

          case "looks-rare": {
            if (!["reservoir", "looks-rare"].includes(params.orderbook)) {
              throw Boom.badRequest("Unsupported orderbook");
            }

            if (params.fee || params.feeRecipient) {
              throw Boom.badRequest("LooksRare does not support explicit fees");
            }

            if (params.excludeFlaggedTokens) {
              throw Boom.badRequest("LooksRare does not support token-list bids");
            }

            let order: Sdk.LooksRare.Order | undefined;
            if (token) {
              const [contract, tokenId] = token.split(":");
              order = await looksRareBuyToken.build({
                ...params,
                maker,
                contract,
                tokenId,
              });
            } else if (collection && !attributeKey && !attributeValue) {
              order = await looksRareBuyCollection.build({
                ...params,
                maker,
                collection,
              });
            } else {
              throw Boom.badRequest("LooksRare only supports single-token or collection-wide bids");
            }

            if (!order) {
              throw Boom.internal("Failed to generate order");
            }

            // Check the maker's approval
            let approvalTx: TxData | undefined;
            const wethApproval = await weth.getAllowance(
              maker,
              Sdk.LooksRare.Addresses.Exchange[config.chainId]
            );
            if (bn(wethApproval).lt(bn(order.params.price))) {
              approvalTx = weth.approveTransaction(
                maker,
                Sdk.LooksRare.Addresses.Exchange[config.chainId]
              );
            }

            steps[0].items.push({
              status: !wrapEthTx ? "complete" : "incomplete",
              data: wrapEthTx,
              orderIndex: i,
            });
            steps[1].items.push({
              status: !approvalTx ? "complete" : "incomplete",
              data: approvalTx,
              orderIndex: i,
            });
            steps[2].items.push({
              status: "incomplete",
              data: {
                sign: order.getSignatureData(),
                post: {
                  endpoint: "/order/v3",
                  method: "POST",
                  body: {
                    order: {
                      kind: "looks-rare",
                      data: {
                        ...order.params,
                      },
                    },
                    tokenSetId,
                    collection:
                      collection && !attributeKey && !attributeValue ? collection : undefined,
                    orderbook: params.orderbook,
                    source,
                  },
                },
              },
              orderIndex: i,
            });

            // Go on with the next bid
            continue;
          }

          case "x2y2": {
            if (!["x2y2"].includes(params.orderbook)) {
              throw Boom.badRequest("Unsupported orderbook");
            }
            if (params.fee || params.feeRecipient) {
              throw Boom.badRequest("X2Y2 does not support explicit fees");
            }
            if (params.excludeFlaggedTokens) {
              throw Boom.badRequest("X2Y2 does not support token-list bids");
            }

            let order: Sdk.X2Y2.Types.LocalOrder | undefined;
            if (token) {
              const [contract, tokenId] = token.split(":");
              order = await x2y2BuyToken.build({
                ...params,
                maker,
                contract,
                tokenId,
              });
            } else if (collection && !attributeKey && !attributeValue) {
              order = await x2y2BuyCollection.build({
                ...params,
                maker,
                collection,
              });
            } else {
              throw Boom.badRequest("X2Y2 only supports single-token or collection-wide bids");
            }

            if (!order) {
              throw Boom.internal("Failed to generate order");
            }

            const upstreamOrder = Sdk.X2Y2.Order.fromLocalOrder(config.chainId, order);

            // Check the maker's approval
            let approvalTx: TxData | undefined;
            const wethApproval = await weth.getAllowance(
              maker,
              Sdk.X2Y2.Addresses.Exchange[config.chainId]
            );
            if (bn(wethApproval).lt(bn(upstreamOrder.params.price))) {
              approvalTx = weth.approveTransaction(
                maker,
                Sdk.X2Y2.Addresses.Exchange[config.chainId]
              );
            }

            steps[0].items.push({
              status: !wrapEthTx ? "complete" : "incomplete",
              data: wrapEthTx,
              orderIndex: i,
            });
            steps[1].items.push({
              status: !approvalTx ? "complete" : "incomplete",
              data: approvalTx,
              orderIndex: i,
            });
            steps[2].items.push({
              status: "incomplete",
              data: {
                sign: new Sdk.X2Y2.Exchange(
                  config.chainId,
                  config.x2y2ApiKey
                ).getOrderSignatureData(order),
                post: {
                  endpoint: "/order/v3",
                  method: "POST",
                  body: {
                    order: {
                      kind: "x2y2",
                      data: {
                        ...order,
                      },
                    },
                    tokenSetId,
                    collection:
                      collection && !attributeKey && !attributeValue ? collection : undefined,
                    orderbook: params.orderbook,
                    source,
                  },
                },
              },
              orderIndex: i,
            });

            // Go on with the next bid
            continue;
          }
        }
      }

      // We should only have a single ETH wrapping transaction
      if (steps[0].items.length > 1) {
        let amount = bn(0);
        for (let i = 0; i < steps[0].items.length; i++) {
          const itemAmount = bn(steps[0].items[i].data?.value || 0);
          if (itemAmount.gt(amount)) {
            amount = itemAmount;
          }
        }

        if (amount.gt(0)) {
          const weth = new Sdk.Common.Helpers.Weth(baseProvider, config.chainId);
          const wethWrapTx = weth.depositTransaction(maker, amount);

          steps[0].items = [
            {
              status: "incomplete",
              data: wethWrapTx,
            },
          ];
        } else {
          steps[0].items = [];
        }
      }

      // De-duplicate step items
      for (const step of steps) {
        // Assume `JSON.stringify` is deterministic
        const uniqueItems = _.uniqBy(step.items, ({ data }) => JSON.stringify(data));
        if (step.items.length > uniqueItems.length) {
          step.items = uniqueItems.map((item) => ({
            status: item.status,
            data: item.data,
            orderIndex: item.orderIndex,
          }));
        }
      }

      return { steps };
    } catch (error) {
      logger.error(`get-execute-bid-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
