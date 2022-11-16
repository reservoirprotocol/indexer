/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, formatEth, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { generateBidDetailsV5 } from "@/orderbook/orders";

const version = "v1";

export const getExecuteSellV1Options: RouteOptions = {
  description: "Sell any token at the best available price (accept bid)",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      token: Joi.string().lowercase().pattern(regex.token).required(),
      taker: Joi.string().lowercase().pattern(regex.address).required(),
      source: Joi.string(),
      referrer: Joi.string().lowercase().pattern(regex.address).default(AddressZero),
      onlyQuote: Joi.boolean().default(false),
      maxFeePerGas: Joi.string().pattern(regex.number),
      maxPriorityFeePerGas: Joi.string().pattern(regex.number),
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
      quote: Joi.number().unsafe(),
      query: Joi.object(),
    }).label(`getExecuteSell${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-sell-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const [contract, tokenId] = query.token.split(":");

      // Fetch the best offer on the current token
      const bestOrderResult = await redb.oneOrNone(
        `
          SELECT
            orders.id,
            orders.kind,
            contracts.kind AS token_kind,
            orders.price,
            orders.raw_data,
            orders.maker,
            orders.token_set_id
          FROM orders
          JOIN contracts
            ON orders.contract = contracts.address
          JOIN token_sets_tokens
            ON orders.token_set_id = token_sets_tokens.token_set_id
          WHERE token_sets_tokens.contract = $/contract/
            AND token_sets_tokens.token_id = $/tokenId/
            AND orders.side = 'buy'
            AND orders.fillability_status = 'fillable'
            AND orders.approval_status = 'approved'
            AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
          ORDER BY orders.value DESC
          LIMIT 1
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );
      if (!bestOrderResult) {
        throw Boom.badRequest("No available orders");
      }

      // The quote is the best offer's price
      const quote = formatEth(bestOrderResult.price);
      if (query.onlyQuote) {
        // Skip generating any transactions if only the quote was requested
        return { quote };
      }

      const bidDetails = await generateBidDetailsV5(
        {
          id: bestOrderResult.id,
          kind: bestOrderResult.kind,
          rawData: bestOrderResult.raw_data,
        },
        {
          kind: bestOrderResult.token_kind,
          contract,
          tokenId,
        }
      );

      const router = new Sdk.RouterV5.Router(config.chainId, baseProvider, {
        x2y2ApiKey: config.x2y2ApiKey,
      });
      const tx = await router.fillBidTx(bidDetails, query.taker, {
        source: query.source,
      });

      // Set up generic filling steps
      const steps = [
        {
          action: "Accept offer",
          description: "To sell this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
        },
        {
          action: "Confirmation",
          description: "Verify that the offer was successfully accepted",
          kind: "confirmation",
        },
      ];

      return {
        steps: [
          {
            ...steps[0],
            status: "incomplete",
            data: {
              ...tx,
              maxFeePerGas: query.maxFeePerGas ? bn(query.maxFeePerGas).toHexString() : undefined,
              maxPriorityFeePerGas: query.maxPriorityFeePerGas
                ? bn(query.maxPriorityFeePerGas).toHexString()
                : undefined,
            },
          },
          {
            ...steps[1],
            status: "incomplete",
            data: {
              endpoint: `/orders/executed/v1?ids=${bestOrderResult.id}`,
              method: "GET",
            },
          },
        ],
        quote,
      };
    } catch (error) {
      logger.error(`get-execute-sell-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
