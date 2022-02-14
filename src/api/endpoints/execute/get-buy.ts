import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { bn } from "@/common/bignumber";
import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";
import * as queries from "@/entities/orders/get-best-order";

export const getExecuteBuyOptions: RouteOptions = {
  description: "Get steps required to accept a sell order (eg. buy).",
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
    }).label("getExecuteBuyResponse"),
    failAction: (_request, _h, error) => {
      logger.error(
        "get_execute_buy_handler",
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const bestOrder = await queries.getBestOrder({
        ...query,
        side: "sell",
      } as queries.GetBestOrderFilter);

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
          {
            action: "Confirmation",
            description: "Confirmation",
            status: "incomplete",
            kind: "confirmation",
            data: {
              endpoint: `/orders/executed?hash=${order.prefixHash()}`,
              method: "GET",
            },
          },
        ],
      };
    } catch (error) {
      logger.error("get_execute_buy_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
