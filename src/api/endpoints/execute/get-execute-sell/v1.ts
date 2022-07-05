/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { BidDetails } from "@reservoir0x/sdk/dist/router/types";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { slowProvider } from "@/common/provider";
import { bn, formatEth, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

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
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .required(),
      taker: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required(),
      referrer: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .default(AddressZero),
      onlyQuote: Joi.boolean().default(false),
      maxFeePerGas: Joi.string().pattern(/^[0-9]+$/),
      maxPriorityFeePerGas: Joi.string().pattern(/^[0-9]+$/),
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

      // Fetch the best offer on the current token.
      const bestOrderResult = await redb.oneOrNone(
        `
          SELECT
            orders.id,
            orders.kind,
            contracts.kind AS token_kind,
            orders.price,
            orders.raw_data,
            orders.source_id,
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
          ORDER BY orders.value DESC
          LIMIT 1
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );

      // Return early in case no offer is available.
      if (!bestOrderResult) {
        throw Boom.badRequest("No available orders");
      }

      // The quote is the best offer's price
      const quote = formatEth(bestOrderResult.price);
      if (query.onlyQuote) {
        // Skip generating any transactions if only the quote was requested
        return { quote };
      }

      let bidDetails: BidDetails;
      switch (bestOrderResult.kind) {
        case "wyvern-v2.3": {
          const extraArgs: any = {};

          const order = new Sdk.WyvernV23.Order(config.chainId, bestOrderResult.raw_data);
          if (order.params.kind?.includes("token-list")) {
            // When filling an attribute order, we also need to pass
            // in the full list of tokens the order is made on (that
            // is, the underlying token set tokens).
            const tokens = await redb.manyOrNone(
              `
                SELECT
                  token_sets_tokens.token_id
                FROM token_sets_tokens
                WHERE token_sets_tokens.token_set_id = $/tokenSetId/
              `,
              { tokenSetId: bestOrderResult.tokenSetId }
            );
            extraArgs.tokenIds = tokens.map(({ token_id }) => token_id);
          }

          bidDetails = {
            kind: "wyvern-v2.3",
            contractKind: bestOrderResult.token_kind,
            contract,
            tokenId,
            extraArgs,
            order,
          };

          break;
        }

        case "seaport": {
          const extraArgs: any = {};

          const order = new Sdk.Seaport.Order(config.chainId, bestOrderResult.raw_data);
          if (order.params.kind?.includes("token-list")) {
            // When filling an attribute order, we also need to pass
            // in the full list of tokens the order is made on (that
            // is, the underlying token set tokens).
            const tokens = await redb.manyOrNone(
              `
                SELECT
                  token_sets_tokens.token_id
                FROM token_sets_tokens
                WHERE token_sets_tokens.token_set_id = $/tokenSetId/
              `,
              { tokenSetId: bestOrderResult.token_set_id }
            );
            extraArgs.tokenIds = tokens.map(({ token_id }) => token_id);
          }

          bidDetails = {
            kind: "seaport",
            contractKind: bestOrderResult.token_kind,
            contract,
            tokenId,
            extraArgs,
            order,
          };

          break;
        }

        case "looks-rare": {
          const order = new Sdk.LooksRare.Order(config.chainId, bestOrderResult.raw_data);

          bidDetails = {
            kind: "looks-rare",
            contractKind: bestOrderResult.token_kind,
            contract,
            tokenId,
            order,
          };

          break;
        }

        case "opendao-erc721":
        case "opendao-erc1155": {
          const order = new Sdk.OpenDao.Order(config.chainId, bestOrderResult.raw_data);

          bidDetails = {
            kind: "opendao",
            contractKind: bestOrderResult.token_kind,
            contract,
            tokenId,
            order,
          };

          break;
        }

        case "zeroex-v4-erc721":
        case "zeroex-v4-erc1155": {
          const order = new Sdk.ZeroExV4.Order(config.chainId, bestOrderResult.raw_data);

          bidDetails = {
            kind: "zeroex-v4",
            contractKind: bestOrderResult.token_kind,
            contract,
            tokenId,
            order,
          };

          break;
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      if (!bidDetails) {
        throw Boom.internal("Could not generate transaction(s)");
      }

      const router = new Sdk.Router.Router(config.chainId, slowProvider);
      const tx = await router.fillBidTx(bidDetails, query.taker, { referrer: query.referrer });

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
              endpoint: `/orders/executed/v1?id=${bestOrderResult.id}`,
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
