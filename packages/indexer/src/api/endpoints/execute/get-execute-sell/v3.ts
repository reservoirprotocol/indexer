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
import { Sources } from "@/models/sources";
import { generateBidDetailsV5 } from "@/orderbook/orders";
import { getNftApproval } from "@/orderbook/orders/common/helpers";

const version = "v3";

export const getExecuteSellV3Options: RouteOptions = {
  description: "Sell tokens (accept bids)",
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
        .pattern(regex.token)
        .required()
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      taker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description(
          "Address of wallet filling the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      source: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .description("Filling source used for attribution. Example: `reservoir.market`"),
      referrer: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .default(AddressZero)
        .description(
          "Wallet address of referrer. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the path will be returned."),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          action: Joi.string().required(),
          description: Joi.string().required(),
          kind: Joi.string().valid("transaction").required(),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string().valid("complete", "incomplete").required(),
                data: Joi.object(),
              })
            )
            .required(),
        })
      ),
      path: Joi.array().items(
        Joi.object({
          orderId: Joi.string(),
          contract: Joi.string().lowercase().pattern(regex.address),
          tokenId: Joi.string().lowercase().pattern(regex.number),
          quantity: Joi.number().unsafe(),
          source: Joi.string().allow("", null),
          currency: Joi.string().lowercase().pattern(regex.address),
          quote: Joi.number().unsafe(),
          rawQuote: Joi.string().pattern(regex.number),
        })
      ),
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
            orders.source_id_int,
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

      // Return early in case no offer is available
      if (!bestOrderResult) {
        throw Boom.badRequest("No available orders");
      }

      const sources = await Sources.getInstance();
      const sourceId = bestOrderResult.source_id_int;

      const path = [
        {
          orderId: bestOrderResult.id,
          contract,
          tokenId,
          quantity: 1,
          source: sourceId ? sources.get(sourceId)?.domain ?? null : null,
          // TODO: Add support for multiple currencies
          currency: Sdk.Common.Addresses.Weth[config.chainId],
          quote: formatEth(bestOrderResult.price),
          rawQuote: bestOrderResult.price,
        },
      ];

      if (query.onlyPath) {
        // Skip generating any transactions if only the path was requested
        return { path };
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
        orderFetcherApiKey: config.orderFetcherApiKey,
      });
      const tx = await router.fillBidTx(bidDetails, query.taker, {
        source: query.source,
      });

      // Set up generic filling steps
      const steps: {
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          data?: any;
        }[];
      }[] = [
        {
          action: "Approve NFT contract",
          description:
            "Each NFT collection you want to trade requires a one-time approval transaction",
          kind: "transaction",
          items: [],
        },
        {
          action: "Accept offer",
          description: "To sell this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
          items: [],
        },
      ];

      // X2Y2/Sudoswap bids are to be filled directly (because the V5 router does not support them)
      if (bidDetails.kind === "x2y2") {
        const isApproved = await getNftApproval(
          bidDetails.contract,
          query.taker,
          Sdk.X2Y2.Addresses.Exchange[config.chainId]
        );
        if (!isApproved) {
          // TODO: Add support for X2Y2 ERC1155 orders
          const approveTx = new Sdk.Common.Helpers.Erc721(
            baseProvider,
            bidDetails.contract
          ).approveTransaction(query.taker, Sdk.X2Y2.Addresses.Exchange[config.chainId]);

          steps[0].items.push({
            status: "incomplete",
            data: {
              ...approveTx,
              maxFeePerGas: query.maxFeePerGas ? bn(query.maxFeePerGas).toHexString() : undefined,
              maxPriorityFeePerGas: query.maxPriorityFeePerGas
                ? bn(query.maxPriorityFeePerGas).toHexString()
                : undefined,
            },
          });
        }
      }
      if (bidDetails.kind === "sudoswap") {
        const isApproved = await getNftApproval(
          bidDetails.contract,
          query.taker,
          Sdk.Sudoswap.Addresses.RouterWithRoyalties[config.chainId]
        );
        if (!isApproved) {
          const approveTx = new Sdk.Common.Helpers.Erc721(
            baseProvider,
            bidDetails.contract
          ).approveTransaction(
            query.taker,
            Sdk.Sudoswap.Addresses.RouterWithRoyalties[config.chainId]
          );

          steps[0].items.push({
            status: "incomplete",
            data: {
              ...approveTx,
              maxFeePerGas: query.maxFeePerGas ? bn(query.maxFeePerGas).toHexString() : undefined,
              maxPriorityFeePerGas: query.maxPriorityFeePerGas
                ? bn(query.maxPriorityFeePerGas).toHexString()
                : undefined,
            },
          });
        }
      }

      steps[1].items.push({
        status: "incomplete",
        data: {
          ...tx,
          maxFeePerGas: query.maxFeePerGas ? bn(query.maxFeePerGas).toHexString() : undefined,
          maxPriorityFeePerGas: query.maxPriorityFeePerGas
            ? bn(query.maxPriorityFeePerGas).toHexString()
            : undefined,
        },
      });

      return {
        steps,
        path,
      };
    } catch (error) {
      logger.error(`get-execute-sell-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
