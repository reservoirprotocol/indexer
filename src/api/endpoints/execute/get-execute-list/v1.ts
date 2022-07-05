/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";

import { logger } from "@/common/logger";
import { slowProvider } from "@/common/provider";
import { config } from "@/config/index";

// OpenDao
import * as openDaoSellToken from "@/orderbook/orders/opendao/build/sell/token";
import * as openDaoCheck from "@/orderbook/orders/opendao/check";

// ZeroExV4
import * as zeroExV4SellToken from "@/orderbook/orders/opendao/build/sell/token";
import * as zeroExV4Check from "@/orderbook/orders/opendao/check";

// Wyvern v2.3
import * as wyvernV23SellToken from "@/orderbook/orders/wyvern-v2.3/build/sell/token";
import * as wyvernV23Utils from "@/orderbook/orders/wyvern-v2.3/utils";
import * as wyvernV23Check from "@/orderbook/orders/wyvern-v2.3/check";

const version = "v1";

export const getExecuteListV1Options: RouteOptions = {
  description: "List a token for sale",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 1,
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .required(),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required(),
      weiPrice: Joi.string()
        .pattern(/^[0-9]+$/)
        .required(),
      orderKind: Joi.string()
        .valid("721ex", "looks-rare", "wyvern-v2.3", "zeroex-v4")
        .default("wyvern-v2.3"),
      orderbook: Joi.string().valid("opensea", "reservoir").default("reservoir"),
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
    }).with("feeRecipient", "fee"),
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
    }).label(`getExecuteList${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-list-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const [contract, tokenId] = query.token.split(":");

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

          const order = await wyvernV23SellToken.build({
            ...query,
            contract,
            tokenId,
          });

          // Make sure the order was successfully generated
          const orderInfo = order?.getInfo();
          if (!order || !orderInfo) {
            throw Boom.internal("Failed to generate order");
          }

          const steps = [
            {
              action: "Initialize wallet",
              description:
                "A one-time setup transaction to enable trading with the Wyvern Protocol (used by Open Sea)",
              kind: "transaction",
            },
            {
              action: "Approve NFT contract",
              description:
                "Each NFT collection you want to trade requires a one-time approval transaction",
              kind: "transaction",
            },
            {
              action: "Authorize listing",
              description: "A free off-chain signature to create the listing",
              kind: "signature",
            },
            {
              action: "Submit listing",
              description: "Post your listing to the order book for others to discover it",
              kind: "request",
            },
          ];

          // Check the order's fillability
          try {
            await wyvernV23Check.offChainCheck(order, { onChainApprovalRecheck: true });
          } catch (error: any) {
            switch (error.message) {
              case "no-balance-no-approval":
              case "no-balance": {
                // We cannot do anything if the user doesn't own the listed token
                throw Boom.badData("Maker does not own the listed token");
              }

              case "no-user-proxy": {
                // Generate a proxy registration transaction

                const proxyRegistry = new Sdk.WyvernV23.Helpers.ProxyRegistry(
                  slowProvider,
                  config.chainId
                );
                const proxyRegistrationTx = proxyRegistry.registerProxyTransaction(query.maker);

                return {
                  steps: [
                    {
                      ...steps[0],
                      status: "incomplete",
                      data: proxyRegistrationTx,
                    },
                    {
                      ...steps[1],
                      status: "incomplete",
                    },
                    {
                      ...steps[2],
                      status: "incomplete",
                    },
                    {
                      ...steps[3],
                      status: "incomplete",
                    },
                  ],
                };
              }

              case "no-approval": {
                // Generate an approval transaction

                const userProxy = await wyvernV23Utils.getUserProxy(query.maker);
                const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";

                const approvalTx = (
                  kind === "erc721"
                    ? new Sdk.Common.Helpers.Erc721(slowProvider, orderInfo.contract)
                    : new Sdk.Common.Helpers.Erc1155(slowProvider, orderInfo.contract)
                ).approveTransaction(query.maker, userProxy!);

                return {
                  steps: [
                    {
                      ...steps[0],
                      status: "complete",
                    },
                    {
                      ...steps[1],
                      status: "incomplete",
                      data: approvalTx,
                    },
                    {
                      ...steps[2],
                      status: "incomplete",
                    },
                    {
                      ...steps[3],
                      status: "incomplete",
                    },
                  ],
                };
              }
            }
          }

          const hasSignature = query.v && query.r && query.s;

          return {
            steps: [
              {
                ...steps[0],
                status: "complete",
              },
              {
                ...steps[1],
                status: "complete",
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

          const steps = [
            {
              action: "Approve NFT contract",
              description:
                "Each NFT collection you want to trade requires a one-time approval transaction",
              kind: "transaction",
            },
            {
              action: "Authorize listing",
              description: "A free off-chain signature to create the listing",
              kind: "signature",
            },
            {
              action: "Submit listing",
              description: "Post your listing to the order book for others to discover it",
              kind: "request",
            },
          ];

          const order = await openDaoSellToken.build({
            ...query,
            contract,
            tokenId,
          });

          if (!order) {
            throw Boom.internal("Failed to generate order");
          }

          let approvalTx: TxData | undefined;

          // Check the order's fillability
          try {
            await openDaoCheck.offChainCheck(order, { onChainApprovalRecheck: true });
          } catch (error: any) {
            switch (error.message) {
              case "no-balance-no-approval":
              case "no-balance": {
                // We cannot do anything if the user doesn't own the listed token
                throw Boom.badData("Maker does not own the listed token");
              }

              case "no-approval": {
                // Generate an approval transaction

                const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";

                approvalTx = (
                  kind === "erc721"
                    ? new Sdk.Common.Helpers.Erc721(slowProvider, order.params.nft)
                    : new Sdk.Common.Helpers.Erc1155(slowProvider, order.params.nft)
                ).approveTransaction(query.maker, Sdk.OpenDao.Addresses.Exchange[config.chainId]);

                break;
              }
            }
          }

          const hasSignature = query.v && query.r && query.s;

          return {
            steps: [
              {
                ...steps[0],
                status: approvalTx ? "incomplete" : "complete",
                data: approvalTx,
              },
              {
                ...steps[1],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature ? undefined : order.getSignatureData(),
              },
              {
                ...steps[2],
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

          const steps = [
            {
              action: "Approve NFT contract",
              description:
                "Each NFT collection you want to trade requires a one-time approval transaction",
              kind: "transaction",
            },
            {
              action: "Authorize listing",
              description: "A free off-chain signature to create the listing",
              kind: "signature",
            },
            {
              action: "Submit listing",
              description: "Post your listing to the order book for others to discover it",
              kind: "request",
            },
          ];

          const order = await zeroExV4SellToken.build({
            ...query,
            contract,
            tokenId,
          });

          if (!order) {
            throw Boom.internal("Failed to generate order");
          }

          let approvalTx: TxData | undefined;

          // Check the order's fillability
          try {
            await zeroExV4Check.offChainCheck(order, { onChainApprovalRecheck: true });
          } catch (error: any) {
            switch (error.message) {
              case "no-balance-no-approval":
              case "no-balance": {
                // We cannot do anything if the user doesn't own the listed token
                throw Boom.badData("Maker does not own the listed token");
              }

              case "no-approval": {
                // Generate an approval transaction

                const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";

                approvalTx = (
                  kind === "erc721"
                    ? new Sdk.Common.Helpers.Erc721(slowProvider, order.params.nft)
                    : new Sdk.Common.Helpers.Erc1155(slowProvider, order.params.nft)
                ).approveTransaction(query.maker, Sdk.ZeroExV4.Addresses.Exchange[config.chainId]);

                break;
              }
            }
          }

          const hasSignature = query.v && query.r && query.s;

          return {
            steps: [
              {
                ...steps[0],
                status: approvalTx ? "incomplete" : "complete",
                data: approvalTx,
              },
              {
                ...steps[1],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature ? undefined : order.getSignatureData(),
              },
              {
                ...steps[2],
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
      logger.error(`get-execute-list-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
