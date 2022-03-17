/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v1";

export const getExecuteBuyV1Options: RouteOptions = {
  description: "Get steps required to accept a sell order (eg. buy an item).",
  tags: ["api", "execute"],
  validate: {
    query: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}:[0-9]+$/)
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
          kind: Joi.string()
            .valid("request", "signature", "transaction", "confirmation")
            .required(),
          data: Joi.object(),
        })
      ),
      query: Joi.object(),
    }).label(`getExecuteBuy${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-execute-buy-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const [contract, tokenId] = query.token.split(":");

      const bestOrderResult = await edb.oneOrNone(
        `
          SELECT
            "o"."id",
            "o"."kind",
            "o"."token_set_id",
            "o"."raw_data"
          FROM "tokens" "t"
          JOIN "orders" "o"
            ON "t"."floor_sell_id" = "o"."id"
          WHERE "t"."contract" = $/contract/
            AND "t"."token_id" = $/tokenId/
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );

      if (!bestOrderResult) {
        throw Boom.badRequest("No liquidity available");
      }

      const steps = [
        {
          action: "Confirm purchase",
          description:
            "To purchase this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
        },
        {
          action: "Confirmation",
          description: "Verify that the item was successfully purchased",
          kind: "confirmation",
        },
      ];

      let fillTx: TxData | undefined;
      switch (bestOrderResult.kind) {
        case "wyvern-v2.3": {
          const order = new Sdk.WyvernV23.Order(
            config.chainId,
            bestOrderResult.raw_data
          );

          // Check the taker's Eth balance.
          const balance = await baseProvider.getBalance(query.taker);
          if (bn(balance).lt(order.params.basePrice)) {
            // We cannot do anything if the taker doesn't have sufficient balance.
            throw Boom.badData("Taker does not have sufficient balance");
          }

          // Create matching order.
          const buyOrder = order.buildMatching(query.taker, { tokenId });

          const exchange = new Sdk.WyvernV23.Exchange(config.chainId);
          fillTx = exchange.matchTransaction(query.taker, buyOrder, order);

          break;
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      if (!fillTx) {
        throw Boom.internal("Could not generate buy transaction");
      }

      return {
        steps: [
          {
            ...steps[0],
            status: "incomplete",
            data: fillTx,
          },
          {
            ...steps[1],
            status: "incomplete",
            data: {
              endpoint: `/orders/executed/v1?id=${bestOrderResult.id}`,
              method: "GET",
            },
          },
        ],
      };
    } catch (error) {
      logger.error(
        `get-execute-buy-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};
