import { AddressZero } from "@ethersproject/constants";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { bn } from "@/common/bignumber";
import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import * as wyvernV2 from "@/orders/wyvern-v2";

export const getExecuteBuildOptions: RouteOptions = {
  description: "Get steps required to build an order.",
  tags: ["api", "execute"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string(),
      collection: Joi.string().lowercase(),
      attributeKey: Joi.string(),
      attributeValue: Joi.string(),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
      side: Joi.string().lowercase().valid("sell", "buy").required(),
      price: Joi.string().required(),
      fee: Joi.alternatives(Joi.string(), Joi.number()).required(),
      feeRecipient: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .disallow(AddressZero)
        .required(),
      listingTime: Joi.alternatives(Joi.string(), Joi.number()),
      expirationTime: Joi.alternatives(Joi.string(), Joi.number()),
      salt: Joi.string(),
    })
      .or("contract", "collection")
      .oxor("contract", "collection")
      .with("contract", "tokenId")
      .with("attributeKey", ["collection", "attributeValue"]),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          description: Joi.string().required(),
          status: Joi.string().valid("executed", "missing").required(),
          kind: Joi.string().valid("transaction", "order-signature").required(),
          data: Joi.any(),
        })
      ),
      error: Joi.string(),
    }).label("getExecuteBuildResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_orders_build_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const order = await wyvernV2.buildOrder(
        query as wyvernV2.BuildOrderOptions
      );

      if (!order) {
        return { error: "Could not generate order" };
      }

      if (order.params.side === Sdk.WyvernV2.Types.OrderSide.BUY) {
        let ethWrapTransaction;

        // Step 1: Check the maker's balance
        const weth = new Sdk.Common.Helpers.Weth(baseProvider, config.chainId);
        const wethBalance = await weth.getBalance(query.maker);
        if (bn(wethBalance).lt(order.params.basePrice)) {
          const ethBalance = await baseProvider.getBalance(query.maker);
          if (bn(wethBalance).add(ethBalance).lt(order.params.basePrice)) {
            return { error: "Not enough balance" };
          } else {
            ethWrapTransaction = weth.depositTransaction(
              query.maker,
              bn(order.params.basePrice).sub(wethBalance)
            );
          }
        }

        // Step 2: Check the maker's approval
        const wethApproval = await weth.getAllowance(
          query.maker,
          Sdk.WyvernV2.Addresses.TokenTransferProxy[config.chainId]
        );

        let isWethApproved = true;
        let wethApprovalTx;
        if (bn(wethApproval).lt(order.params.basePrice)) {
          isWethApproved = false;
          wethApprovalTx = weth.approveTransaction(
            query.maker,
            Sdk.WyvernV2.Addresses.TokenTransferProxy[config.chainId]
          );
        }

        return {
          steps: [
            {
              description: "Wrapping ETH",
              status: ethWrapTransaction ? "missing" : "executed",
              kind: "transaction",
              data: ethWrapTransaction,
            },
            {
              description: "Approving WETH",
              status: isWethApproved ? "executed" : "missing",
              kind: "transaction",
              data: isWethApproved ? undefined : wethApprovalTx,
            },
            {
              description: "Signing order",
              status: "missing",
              kind: "order-signature",
              data: {
                message: {
                  kind: "eip191",
                  value: order.hash(),
                },
                order: {
                  kind: "wyvern-v2",
                  data: order.params,
                  attribute:
                    query.collection &&
                    query.attributeKey &&
                    query.attributeValue
                      ? {
                          collection: query.collection,
                          key: query.attributeKey,
                          value: query.attributeValue,
                        }
                      : undefined,
                },
              },
            },
          ],
        };
      } else {
        // Step 1: Check that the taker owns the token
        const { kind } = await db.one(
          `
            select "c"."kind" from "contracts" "c"
            where "c"."address" = $/address/
          `,
          { address: order.params.target }
        );

        if (kind === "erc721") {
          const contract = new Sdk.Common.Helpers.Erc721(
            baseProvider,
            order.params.target
          );
          const owner = await contract.getOwner(query.tokenId);
          if (owner.toLowerCase() !== query.maker) {
            return { error: "No ownership" };
          }
        } else if (kind === "erc1155") {
          const contract = new Sdk.Common.Helpers.Erc1155(
            baseProvider,
            order.params.target
          );
          const balance = await contract.getBalance(query.maker, query.tokenId);
          if (bn(balance).isZero()) {
            return { error: "No ownership" };
          }
        } else {
          return { error: "Unknown contract" };
        }

        // Step 2: Check that the taker has registered a user proxy
        const proxyRegistry = new Sdk.WyvernV2.Helpers.ProxyRegistry(
          baseProvider,
          config.chainId
        );
        const proxy = await proxyRegistry.getProxy(query.maker);
        if (proxy === AddressZero) {
          const proxyRegistrationTx = proxyRegistry.registerProxyTransaction(
            query.maker
          );
          return {
            steps: [
              {
                description: "Proxy registration",
                status: "missing",
                kind: "transaction",
                data: proxyRegistrationTx,
              },
              {
                description: "Approving token",
                status: "missing",
                kind: "transaction",
              },
              {
                description: "Signing and relaying order",
                status: "missing",
                kind: "order-signature",
              },
            ],
          };
        }

        // Step 3: Check the taker's approval
        let isApproved: boolean;
        let approvalTx;
        if (kind === "erc721") {
          const contract = new Sdk.Common.Helpers.Erc721(
            baseProvider,
            order.params.target
          );
          isApproved = await contract.isApproved(query.maker, proxy);
          approvalTx = contract.approveTransaction(query.maker, proxy);
        } else if (kind === "erc1155") {
          const contract = new Sdk.Common.Helpers.Erc1155(
            baseProvider,
            order.params.target
          );
          isApproved = await contract.isApproved(query.maker, proxy);
          approvalTx = contract.approveTransaction(query.maker, proxy);
        } else {
          return { error: "Unknown contract" };
        }

        return {
          steps: [
            {
              description: "Proxy registration",
              status: "executed",
              kind: "transaction",
            },
            {
              description: "Approving proxy",
              status: isApproved ? "executed" : "missing",
              kind: "transaction",
              data: isApproved ? undefined : approvalTx,
            },
            {
              description: "Signing and relaying order",
              status: "missing",
              kind: "order-signature",
              data: {
                message: {
                  kind: "eip191",
                  value: order.hash(),
                },
                order: {
                  kind: "wyvern-v2",
                  data: order.params,
                },
              },
            },
          ],
        };
      }
    } catch (error) {
      logger.error("get_execute_build_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
