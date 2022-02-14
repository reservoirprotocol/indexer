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

export const getExecuteListOptions: RouteOptions = {
  description: "Get steps required to build a sell order.",
  tags: ["api", "execute"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      tokenId: Joi.string(),
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
    }).label("getExecuteListResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_execute_list_handler",
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
        side: "sell",
      } as wyvernV2.BuildOrderOptions);

      if (!order) {
        return { error: "Could not generate order" };
      }

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
              action: "Proxy registration",
              description: "Proxy registration",
              status: "incomplete",
              kind: "transaction",
              data: proxyRegistrationTx,
            },
            {
              action: "Approving token",
              description: "Approving token",
              status: "incomplete",
              kind: "transaction",
            },
            {
              action: "Signing order",
              description: "Signing order",
              status: "incomplete",
              kind: "signature",
            },
            {
              action: "Relaying order",
              description: "Relaying order",
              status: "incomplete",
              kind: "request",
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

      const hasSignature = query.v && query.r && query.s;

      return {
        steps: [
          {
            action: "Proxy registration",
            description: "Proxy registration",
            status: "complete",
            kind: "transaction",
          },
          {
            action: "Approving proxy",
            description: "Approving proxy",
            status: isApproved ? "complete" : "incomplete",
            kind: "transaction",
            data: isApproved ? undefined : approvalTx,
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
      logger.error("get_execute_list_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
