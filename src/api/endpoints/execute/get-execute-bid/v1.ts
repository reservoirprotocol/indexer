/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";

import { logger } from "@/common/logger";
import { slowProvider } from "@/common/provider";
import { bn } from "@/common/utils";
import { config } from "@/config/index";

// OpenDao
import * as openDaoBuyToken from "@/orderbook/orders/opendao/build/buy/token";

// ZeroExV4
import * as zeroExV4BuyToken from "@/orderbook/orders/zeroex-v4/build/buy/token";

// Wyvern v2.3
import * as wyvernV23BuyAttribute from "@/orderbook/orders/wyvern-v2.3/build/buy/attribute";
import * as wyvernV23BuyCollection from "@/orderbook/orders/wyvern-v2.3/build/buy/collection";
import * as wyvernV23BuyToken from "@/orderbook/orders/wyvern-v2.3/build/buy/token";

const version = "v1";

export const getExecuteBidV1Options: RouteOptions = {
  description: "Create a bid on any token, collection or trait",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 2,
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Filter to a particular token, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      collection: Joi.string()
        .lowercase()
        .description(
          "Filter to a particular collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        ),
      attributeKey: Joi.string(),
      attributeValue: Joi.string(),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required(),
      weiPrice: Joi.string()
        .pattern(/^[0-9]+$/)
        .required(),
      orderKind: Joi.string().valid("wyvern-v2.3", "721ex", "zeroex-v4").default("wyvern-v2.3"),
      orderbook: Joi.string().valid("reservoir", "opensea").default("reservoir"),
      source: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      automatedRoyalties: Joi.boolean().default(true),
      fee: Joi.alternatives(Joi.string(), Joi.number()),
      feeRecipient: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .disallow(AddressZero),
      listingTime: Joi.alternatives(Joi.string(), Joi.number()),
      expirationTime: Joi.alternatives(Joi.string(), Joi.number()),
      salt: Joi.string(),
      nonce: Joi.string(),
      v: Joi.number(),
      r: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{64}$/),
      s: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{64}$/),
    })
      .or("token", "collection")
      .oxor("token", "collection")
      .with("attributeValue", "attributeKey")
      .with("attributeKey", "collection")
      .with("feeRecipient", "fee"),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          action: Joi.string().required(),
          description: Joi.string().required(),
          status: Joi.string().valid("complete", "incomplete").required(),
          kind: Joi.string().valid("request", "signature", "transaction").required(),
          data: Joi.object(),
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
    const query = request.query as any;

    try {
      const token = query.token;
      const collection = query.collection;
      const attributeKey = query.attributeKey;
      const attributeValue = query.attributeValue;

      // On Rinkeby, proxy ZeroEx V4 to 721ex
      if (query.orderKind === "zeroex-v4" && config.chainId === 4) {
        query.orderKind = "721ex";
      }

      switch (query.orderKind) {
        case "wyvern-v2.3": {
          if (!["reservoir", "opensea"].includes(query.orderbook)) {
            throw Boom.badRequest("Unsupported orderbook");
          }
          if (query.automatedRoyalties && query.feeRecipient) {
            throw Boom.badRequest("Exchange does not supported multiple fee recipients");
          }

          let order: Sdk.WyvernV23.Order | undefined;
          if (token) {
            const [contract, tokenId] = token.split(":");

            order = await wyvernV23BuyToken.build({
              ...query,
              contract,
              tokenId,
            });
          } else if (collection && attributeKey && attributeValue) {
            if (query.orderbook !== "reservoir") {
              throw Boom.notImplemented("Attribute bids are not supported outside of Reservoir");
            }

            order = await wyvernV23BuyAttribute.build({
              ...query,
              collection,
              attributes: [
                {
                  key: attributeKey,
                  value: attributeValue,
                },
              ],
            });
          } else if (collection) {
            if (query.orderbook !== "reservoir") {
              throw Boom.notImplemented("Collection bids are not supported outside of Reservoir");
            }

            order = await wyvernV23BuyCollection.build({
              ...query,
              collection,
            });
          }

          // Make sure the order was successfully generated
          const orderInfo = order?.getInfo();
          if (!order || !orderInfo) {
            throw Boom.internal("Failed to generate order");
          }

          // Check the maker's Weth/Eth balance
          let wrapEthTx: TxData | undefined;
          const weth = new Sdk.Common.Helpers.Weth(slowProvider, config.chainId);
          const wethBalance = await weth.getBalance(query.maker);
          if (bn(wethBalance).lt(order.params.basePrice)) {
            const ethBalance = await slowProvider.getBalance(query.maker);
            if (bn(wethBalance).add(ethBalance).lt(order.params.basePrice)) {
              // We cannot do anything if the maker doesn't have sufficient balance
              throw Boom.badData("Maker does not have sufficient balance");
            } else {
              wrapEthTx = weth.depositTransaction(
                query.maker,
                bn(order.params.basePrice).sub(wethBalance)
              );
            }
          }

          // Check the maker's approval
          let approvalTx: TxData | undefined;
          const wethApproval = await weth.getAllowance(
            query.maker,
            Sdk.WyvernV23.Addresses.TokenTransferProxy[config.chainId]
          );
          if (bn(wethApproval).lt(order.params.basePrice)) {
            approvalTx = weth.approveTransaction(
              query.maker,
              Sdk.WyvernV23.Addresses.TokenTransferProxy[config.chainId]
            );
          }

          const steps = [
            {
              action: "Wrapping ETH",
              description: "Wrapping ETH required to make offer",
              kind: "transaction",
            },
            {
              action: "Approve WETH contract",
              description: "A one-time setup transaction to enable trading with WETH",
              kind: "transaction",
            },
            {
              action: "Authorize offer",
              description: "A free off-chain signature to create the offer",
              kind: "signature",
            },
            {
              action: "Submit offer",
              description: "Post your offer to the order book for others to discover it",
              kind: "request",
            },
          ];

          const hasSignature = query.v && query.r && query.s;

          return {
            steps: [
              {
                ...steps[0],
                status: !wrapEthTx ? "complete" : "incomplete",
                data: wrapEthTx,
              },
              {
                ...steps[1],
                status: !approvalTx ? "complete" : "incomplete",
                data: approvalTx,
              },
              {
                ...steps[2],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature ? undefined : order.getSignatureData(),
              },
              {
                ...steps[3],
                status: "incomplete",
                data: !hasSignature
                  ? undefined
                  : {
                      endpoint: "/order/v1",
                      method: "POST",
                      body: {
                        order: {
                          kind: "wyvern-v2.3",
                          data: {
                            ...order.params,
                            v: query.v,
                            r: query.r,
                            s: query.s,
                            contract: query.contract,
                            tokenId: query.tokenId,
                          },
                        },
                        attribute:
                          collection && attributeKey && attributeValue
                            ? {
                                collection,
                                key: attributeKey,
                                value: attributeValue,
                              }
                            : undefined,
                        orderbook: query.orderbook,
                        source: query.source,
                      },
                    },
              },
            ],
            query: {
              ...query,
              listingTime: order.params.listingTime,
              expirationTime: order.params.expirationTime,
              salt: order.params.salt,
            },
          };
        }

        case "721ex": {
          if (!["reservoir"].includes(query.orderbook)) {
            throw Boom.badRequest("Unsupported orderbook");
          }
          if (collection || attributeKey || attributeValue) {
            throw Boom.notImplemented(
              "Collection and attribute bids are not yet supported for 721ex"
            );
          }

          const [contract, tokenId] = token.split(":");
          const order = await openDaoBuyToken.build({
            ...query,
            contract,
            tokenId,
          });

          if (!order) {
            throw Boom.internal("Failed to generate order");
          }

          // Check the maker's Weth/Eth balance
          let wrapEthTx: TxData | undefined;
          const weth = new Sdk.Common.Helpers.Weth(slowProvider, config.chainId);
          const wethBalance = await weth.getBalance(query.maker);
          if (bn(wethBalance).lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))) {
            const ethBalance = await slowProvider.getBalance(query.maker);
            if (
              bn(wethBalance)
                .add(ethBalance)
                .lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))
            ) {
              // We cannot do anything if the maker doesn't have sufficient balance
              throw Boom.badData("Maker does not have sufficient balance");
            } else {
              wrapEthTx = weth.depositTransaction(
                query.maker,
                bn(order.params.erc20TokenAmount).add(order.getFeeAmount()).sub(wethBalance)
              );
            }
          }

          // Check the maker's approval
          let approvalTx: TxData | undefined;
          const wethApproval = await weth.getAllowance(
            query.maker,
            Sdk.OpenDao.Addresses.Exchange[config.chainId]
          );
          if (bn(wethApproval).lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))) {
            approvalTx = weth.approveTransaction(
              query.maker,
              Sdk.OpenDao.Addresses.Exchange[config.chainId]
            );
          }

          const steps = [
            {
              action: "Wrapping ETH",
              description: "Wrapping ETH required to make offer",
              kind: "transaction",
            },
            {
              action: "Approve WETH contract",
              description: "A one-time setup transaction to enable trading with WETH",
              kind: "transaction",
            },
            {
              action: "Authorize offer",
              description: "A free off-chain signature to create the offer",
              kind: "signature",
            },
            {
              action: "Submit offer",
              description: "Post your offer to the order book for others to discover it",
              kind: "request",
            },
          ];

          const hasSignature = query.v && query.r && query.s;

          return {
            steps: [
              {
                ...steps[0],
                status: !wrapEthTx ? "complete" : "incomplete",
                data: wrapEthTx,
              },
              {
                ...steps[1],
                status: !approvalTx ? "complete" : "incomplete",
                data: approvalTx,
              },
              {
                ...steps[2],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature ? undefined : order.getSignatureData(),
              },
              {
                ...steps[3],
                status: "incomplete",
                data: !hasSignature
                  ? undefined
                  : {
                      endpoint: "/order/v1",
                      method: "POST",
                      body: {
                        order: {
                          kind: "721ex",
                          data: {
                            ...order.params,
                            v: query.v,
                            r: query.r,
                            s: query.s,
                          },
                        },
                        orderbook: query.orderbook,
                        source: query.source,
                      },
                    },
              },
            ],
            query: {
              ...query,
              expirationTime: order.params.expiry,
              nonce: order.params.nonce,
            },
          };
        }

        case "zeroex-v4": {
          if (!["reservoir"].includes(query.orderbook)) {
            throw Boom.badRequest("Unsupported orderbook");
          }
          if (collection || attributeKey || attributeValue) {
            throw Boom.notImplemented(
              "Collection and attribute bids are not yet supported for 721ex"
            );
          }

          const [contract, tokenId] = token.split(":");
          const order = await zeroExV4BuyToken.build({
            ...query,
            contract,
            tokenId,
          });

          if (!order) {
            throw Boom.internal("Failed to generate order");
          }

          // Check the maker's Weth/Eth balance
          let wrapEthTx: TxData | undefined;
          const weth = new Sdk.Common.Helpers.Weth(slowProvider, config.chainId);
          const wethBalance = await weth.getBalance(query.maker);
          if (bn(wethBalance).lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))) {
            const ethBalance = await slowProvider.getBalance(query.maker);
            if (
              bn(wethBalance)
                .add(ethBalance)
                .lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))
            ) {
              // We cannot do anything if the maker doesn't have sufficient balance
              throw Boom.badData("Maker does not have sufficient balance");
            } else {
              wrapEthTx = weth.depositTransaction(
                query.maker,
                bn(order.params.erc20TokenAmount).add(order.getFeeAmount()).sub(wethBalance)
              );
            }
          }

          // Check the maker's approval
          let approvalTx: TxData | undefined;
          const wethApproval = await weth.getAllowance(
            query.maker,
            Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
          );
          if (bn(wethApproval).lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))) {
            approvalTx = weth.approveTransaction(
              query.maker,
              Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
            );
          }

          const steps = [
            {
              action: "Wrapping ETH",
              description: "Wrapping ETH required to make offer",
              kind: "transaction",
            },
            {
              action: "Approve WETH contract",
              description: "A one-time setup transaction to enable trading with WETH",
              kind: "transaction",
            },
            {
              action: "Authorize offer",
              description: "A free off-chain signature to create the offer",
              kind: "signature",
            },
            {
              action: "Submit offer",
              description: "Post your offer to the order book for others to discover it",
              kind: "request",
            },
          ];

          const hasSignature = query.v && query.r && query.s;

          return {
            steps: [
              {
                ...steps[0],
                status: !wrapEthTx ? "complete" : "incomplete",
                data: wrapEthTx,
              },
              {
                ...steps[1],
                status: !approvalTx ? "complete" : "incomplete",
                data: approvalTx,
              },
              {
                ...steps[2],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature ? undefined : order.getSignatureData(),
              },
              {
                ...steps[3],
                status: "incomplete",
                data: !hasSignature
                  ? undefined
                  : {
                      endpoint: "/order/v1",
                      method: "POST",
                      body: {
                        order: {
                          kind: "zeroex-v4",
                          data: {
                            ...order.params,
                            v: query.v,
                            r: query.r,
                            s: query.s,
                          },
                        },
                        orderbook: query.orderbook,
                        source: query.source,
                      },
                    },
              },
            ],
            query: {
              ...query,
              expirationTime: order.params.expiry,
              nonce: order.params.nonce,
            },
          };
        }
      }
    } catch (error) {
      logger.error(`get-execute-bid-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
