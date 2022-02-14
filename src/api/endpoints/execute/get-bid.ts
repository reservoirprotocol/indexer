import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { bn } from "@/common/bignumber";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import * as wyvernV2 from "@/orders/wyvern-v2";

export const getExecuteBidOptions: RouteOptions = {
  description: "Get steps required to build a buy order.",
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
      price: Joi.string().required(),
      orderbook: Joi.string()
        .valid("reservoir", "opensea")
        .default("reservoir"),
      v: Joi.number(),
      r: Joi.string().pattern(/^0x[a-f0-9]{64}$/),
      s: Joi.string().pattern(/^0x[a-f0-9]{64}$/),
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
          action: Joi.string().required(),
          description: Joi.string().required(),
          status: Joi.string().valid("complete", "incomplete").required(),
          kind: Joi.string()
            .valid("request", "signature", "transaction")
            .required(),
          data: Joi.any(),
        })
      ),
      query: Joi.any(),
      error: Joi.string(),
    }).label("getExecuteBidResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_execute_bid_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const order = await wyvernV2.buildOrder({
        ...query,
        side: "buy",
      } as wyvernV2.BuildOrderOptions);

      if (!order) {
        return { error: "Could not generate order" };
      }

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

      const hasSignature = query.v && query.r && query.s;

      return {
        steps: [
          {
            action: "Wrapping ETH",
            description: "Wrapping ETH",
            status: ethWrapTransaction ? "incomplete" : "complete",
            kind: "transaction",
            data: ethWrapTransaction,
          },
          {
            action: "Approving WETH",
            description: "Approving WETH",
            status: isWethApproved ? "complete" : "incomplete",
            kind: "transaction",
            data: isWethApproved ? undefined : wethApprovalTx,
          },
          {
            action: "Signing order",
            description: "Signing order",
            status: hasSignature ? "complete" : "incomplete",
            kind: "signature",
            data: hasSignature
              ? undefined
              : {
                  message: order.hash(),
                  signatureKind: "eip191",
                },
          },
          {
            action: "Relaying order",
            description: "Relaying order",
            status: "incomplete",
            kind: "request",
            data: !hasSignature
              ? undefined
              : {
                  endpoint: "/orders",
                  method: "POST",
                  body: {
                    orders: [
                      {
                        kind: "wyvern-v2",
                        orderbook: query.orderbook,
                        data: {
                          ...order.params,
                          v: query.v,
                          r: query.r,
                          s: query.s,
                          contract: query.contract,
                          tokenId: query.tokenId,
                        },
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
                    ],
                  },
                },
          },
        ],
        query: {
          listingTime: order.params.listingTime,
          expirationTime: order.params.expirationTime,
          salt: order.params.salt,
        },
      };
    } catch (error) {
      logger.error("get_execute_bid_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
