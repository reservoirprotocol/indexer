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
          description: Joi.string().required(),
          kind: Joi.string().valid("tx"),
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
        return { steps: [] };
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
              description: "Fill order",
              kind: "tx",
              data: fillTxData,
            },
          ],
        };
      } else {
        // Step 1: Check the taker's ownership
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

        return { steps: [] };
      }
    } catch (error) {
      logger.error("get_execute_fill_handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
