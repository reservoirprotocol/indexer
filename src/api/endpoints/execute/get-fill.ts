import { AddressZero } from "@ethersproject/constants";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { bn } from "@/common/bignumber";
import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import * as queries from "@/entities/orders/get-best-order";

export const getExecuteFillOptions: RouteOptions = {
  description: "Get steps required to fill an order.",
  tags: ["api", "execute"],
  validate: {
    query: Joi.object({
      contract: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
      tokenId: Joi.string()
        .pattern(/^[0-9]+$/)
        .required(),
      taker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/)
        .required(),
      side: Joi.string().lowercase().valid("sell", "buy").default("sell"),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          action: Joi.string().required(),
          description: Joi.string().required(),
          status: Joi.string().valid("complete", "incomplete").required(),
          kind: Joi.string().valid("transaction").required(),
          data: Joi.any(),
        })
      ),
      error: Joi.string(),
    }).label("getExecuteFillResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_execute_fill_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const bestOrder = await queries.getBestOrder(
        query as queries.GetBestOrderFilter
      );

      if (!bestOrder) {
        return { error: "No matching order" };
      }

      const order = new Sdk.WyvernV2.Order(config.chainId, bestOrder.rawData);

      const buildMatchingArgs: any[] = [];
      if (
        order.params.kind?.endsWith("token-range") ||
        order.params.kind?.endsWith("contract-wide")
      ) {
        // Pass the token id to match
        buildMatchingArgs.push(query.tokenId);
      }
      if (order.params.kind?.endsWith("token-list")) {
        // Pass the token id to match
        buildMatchingArgs.push(query.tokenId);

        const tokens: { token_id: string }[] = await db.manyOrNone(
          `
            select "tst"."token_id" from "token_sets_tokens" "tst"
            where "tst"."token_set_id" = $/tokenSetId/
          `,
          { tokenSetId: bestOrder.tokenSetId }
        );

        // Pass the list of tokens of the underlying filled order
        buildMatchingArgs.push(tokens.map(({ token_id }) => token_id));
      }

      if (order.params.side === Sdk.WyvernV2.Types.OrderSide.SELL) {
        // Step 1: Check the taker's balance
        const balance = await baseProvider.getBalance(query.taker);
        if (bn(balance).lt(order.params.basePrice)) {
          return { error: "Not enough ETH balance" };
        }

        // Step 2: Create matching order
        const buyOrder = order.buildMatching(query.taker, buildMatchingArgs);

        const exchange = new Sdk.WyvernV2.Exchange(config.chainId);
        const fillTxData = exchange.matchTransaction(
          query.taker,
          buyOrder,
          order
        );

        return {
          steps: [
            {
              action: "Fill order",
              description: "Fill order",
              status: "incomplete",
              kind: "transaction",
              data: fillTxData,
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
          if (owner.toLowerCase() !== query.taker) {
            return { error: "No ownership" };
          }
        } else if (kind === "erc1155") {
          const contract = new Sdk.Common.Helpers.Erc1155(
            baseProvider,
            order.params.target
          );
          const balance = await contract.getBalance(query.taker, query.tokenId);
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
        const proxy = await proxyRegistry.getProxy(query.taker);
        if (proxy === AddressZero) {
          const proxyRegistrationTx = proxyRegistry.registerProxyTransaction(
            query.taker
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
                action: "Approving WETH",
                description: "Approving WETH",
                status: "incomplete",
                kind: "transaction",
              },
              {
                action: "Relaying order",
                description: "Relaying order",
                status: "incomplete",
                kind: "transaction",
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
          isApproved = await contract.isApproved(query.taker, proxy);
          approvalTx = contract.approveTransaction(query.taker, proxy);
        } else if (kind === "erc1155") {
          const contract = new Sdk.Common.Helpers.Erc1155(
            baseProvider,
            order.params.target
          );
          isApproved = await contract.isApproved(query.taker, proxy);
          approvalTx = contract.approveTransaction(query.taker, proxy);
        } else {
          return { error: "Unknown contract" };
        }

        const wethContract = new Sdk.Common.Helpers.Weth(
          baseProvider,
          config.chainId
        );
        const wethApproval = await wethContract.getAllowance(
          query.taker,
          Sdk.WyvernV2.Addresses.TokenTransferProxy[config.chainId]
        );

        let isWethApproved = true;
        let wethApprovalTx;
        if (
          bn(wethApproval).lt(
            bn(order.params.basePrice)
              .mul(order.params.takerRelayerFee)
              .div(10000)
          )
        ) {
          isWethApproved = false;
          wethApprovalTx = wethContract.approveTransaction(
            query.taker,
            Sdk.WyvernV2.Addresses.TokenTransferProxy[config.chainId]
          );
        }

        // Step 4: Create matching order
        const sellOrder = order.buildMatching(query.taker, buildMatchingArgs);

        const exchange = new Sdk.WyvernV2.Exchange(config.chainId);
        const fillTxData = exchange.matchTransaction(
          query.taker,
          order,
          sellOrder
        );

        return {
          steps: [
            {
              action: "Proxy registration",
              description: "Proxy registration",
              status: "complete",
              kind: "transaction",
            },
            {
              action: "Approving WETH",
              description: "Approving WETH",
              status: isWethApproved ? "complete" : "incomplete",
              kind: "transaction",
              data: isWethApproved ? undefined : wethApprovalTx,
            },
            {
              action: "Approving proxy",
              description: "Approving proxy",
              status: isApproved ? "complete" : "incomplete",
              kind: "transaction",
              data: isApproved ? undefined : approvalTx,
            },
            {
              action: "Relaying order",
              description: "Relaying order",
              status: "incomplete",
              kind: "transaction",
              data: fillTxData,
            },
          ],
        };
      }
    } catch (error) {
      logger.error("get_execute_fill_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
