/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import * as wyvernV23SellToken from "@/orderbook/orders/wyvern-v2.3/build/sell/token";
import * as wyvernV23Utils from "@/orderbook/orders/wyvern-v2.3/utils";
import { offChainCheck } from "@/orderbook/orders/wyvern-v2.3/check";

const version = "v1";

export const getExecuteListV1Options: RouteOptions = {
  description: "List a token for sale",
  tags: ["api", "3. Router"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    query: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}:[0-9]+$/)
        .required(),
      maker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
      weiPrice: Joi.string()
        .pattern(/^[0-9]+$/)
        .required(),
      orderbook: Joi.string()
        .valid("reservoir", "opensea")
        .default("reservoir"),
      automatedRoyalties: Joi.boolean().default(true),
      fee: Joi.alternatives(Joi.string(), Joi.number()),
      feeRecipient: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .disallow(AddressZero),
      listingTime: Joi.alternatives(Joi.string(), Joi.number()),
      expirationTime: Joi.alternatives(Joi.string(), Joi.number()),
      salt: Joi.string(),
      v: Joi.number(),
      r: Joi.string().pattern(/^0x[a-f0-9]{64}$/),
      s: Joi.string().pattern(/^0x[a-f0-9]{64}$/),
    }),
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
          data: Joi.object(),
        })
      ),
      query: Joi.object(),
    }).label(`getExecuteList${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-execute-list-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const [contract, tokenId] = query.token.split(":");

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
          description:
            "Post your listing to the order book for others to discover it",
          kind: "request",
        },
      ];

      // Check the order's fillability
      try {
        await offChainCheck(order, { onChainSellApprovalRecheck: true });
      } catch (error: any) {
        switch (error.message) {
          case "no-balance": {
            // We cannot do anything if the user doesn't own the listed token
            throw Boom.badData("Maker does not own the listed token");
          }

          case "no-user-proxy": {
            // Generate a proxy registration transaction

            const proxyRegistry = new Sdk.WyvernV23.Helpers.ProxyRegistry(
              baseProvider,
              config.chainId
            );
            const proxyRegistrationTx = proxyRegistry.registerProxyTransaction(
              query.maker
            );

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
            const kind = order.params.kind?.startsWith("erc721")
              ? "erc721"
              : "erc1155";

            const approvalTx = (
              kind === "erc721"
                ? new Sdk.Common.Helpers.Erc721(
                    baseProvider,
                    orderInfo.contract
                  )
                : new Sdk.Common.Helpers.Erc1155(
                    baseProvider,
                    orderInfo.contract
                  )
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
    } catch (error) {
      logger.error(
        `get-execute-list-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
