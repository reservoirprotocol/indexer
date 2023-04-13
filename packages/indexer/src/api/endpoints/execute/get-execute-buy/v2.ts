/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { ListingDetails } from "@reservoir0x/sdk/dist/router/v5/types";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, formatEth, fromBuffer, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { generateListingDetailsV5 } from "@/orderbook/orders";

const version = "v2";

export const getExecuteBuyV2Options: RouteOptions = {
  description: "Buy a token at the best price",
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
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      quantity: Joi.number()
        .integer()
        .positive()
        .description(
          "Quanity of tokens user is buying. Only compatible with ERC1155 tokens. Example: `5`"
        ),
      tokens: Joi.array().items(
        Joi.string()
          .lowercase()
          .pattern(regex.token)
          .description(
            "Array of tokens user is buying. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
          )
      ),
      taker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description(
          "Address of wallet filling the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      onlyQuote: Joi.boolean().default(false).description("If true, only quote will be returned."),
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
      referrerFeeBps: Joi.number()
        .integer()
        .min(0)
        .max(10000)
        .default(0)
        .description("Fee amount in BPS. Example: `100`."),
      partial: Joi.boolean()
        .default(false)
        .description("If true, partial orders will be accepted."),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
      skipBalanceCheck: Joi.boolean()
        .default(false)
        .description("If true, balance check will be skipped."),
    })
      .or("token", "tokens")
      .oxor("token", "tokens")
      .with("quantity", "token"),
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
      path: Joi.array().items(
        Joi.object({
          contract: Joi.string().lowercase().pattern(regex.address),
          tokenId: Joi.string().lowercase().pattern(regex.number),
          quantity: Joi.number().unsafe(),
          source: Joi.string().allow("", null),
          quote: Joi.number().unsafe(),
        })
      ),
      query: Joi.object(),
    }).label(`getExecuteBuy${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-buy-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      // We need each filled order's source for the path
      const sources = await Sources.getInstance();

      // Keep track of the filled path
      const path: {
        contract: string;
        tokenId: string;
        quantity: number;
        source: string | null;
        quote: number;
      }[] = [];

      let confirmationQuery = "";

      // Consistently handle a single token vs multiple tokens
      let tokens: string[] = [];
      if (query.token) {
        tokens = [query.token];
      } else {
        tokens = query.tokens;
      }
      // Use a default quantity if missing
      if (!query.quantity) {
        query.quantity = 1;
      }

      const listingDetails: ListingDetails[] = [];
      for (const token of tokens) {
        const [contract, tokenId] = token.split(":");

        if (query.quantity === 1) {
          // Filling a quantity of 1 implies getting the best listing for that token
          const bestOrderResult = await redb.oneOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                contracts.kind AS token_kind,
                orders.price,
                orders.raw_data,
                orders.source_id_int,
                orders.currency
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              WHERE orders.token_set_id = $/tokenSetId/
                AND orders.side = 'sell'
                AND orders.fillability_status = 'fillable'
                AND orders.approval_status = 'approved'
                AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                AND orders.currency = '\\x0000000000000000000000000000000000000000'
              ORDER BY orders.value, orders.fee_bps
              LIMIT 1
            `,
            { tokenSetId: `token:${contract}:${tokenId}` }
          );
          if (!bestOrderResult) {
            // Return early in case no listing is available
            throw Boom.badRequest("No available orders");
          }

          const { id, kind, token_kind, price, source_id_int, currency, raw_data } =
            bestOrderResult;

          path.push({
            contract,
            tokenId,
            quantity: 1,
            source: sources.get(source_id_int)?.name ?? null,
            quote: formatEth(bn(price).add(bn(price).mul(query.referrerFeeBps).div(10000))),
          });
          if (query.onlyQuote) {
            // Skip generating any transactions if only the quote was requested
            continue;
          }

          listingDetails.push(
            generateListingDetailsV5(
              {
                id,
                kind,
                currency: fromBuffer(currency),
                rawData: raw_data,
              },
              {
                kind: token_kind,
                contract,
                tokenId,
              }
            )
          );
          confirmationQuery += `${confirmationQuery.length ? "&" : "?"}ids=${id}`;
        } else {
          // Only ERC1155 tokens support a quantity greater than 1
          const kindResult = await redb.one(
            `
              SELECT contracts.kind FROM contracts
              WHERE contracts.address = $/contract/
            `,
            { contract: toBuffer(contract) }
          );
          if (kindResult?.kind !== "erc1155") {
            throw Boom.badData("Unsupported token kind");
          }

          // Fetch matching orders until the quantity to fill is met
          const bestOrdersResult = await redb.manyOrNone(
            `
              SELECT
                x.id,
                x.kind,
                x.price,
                x.quantity_remaining,
                x.source_id_int,
                x.raw_data,
                x.currency
              FROM (
                SELECT
                  orders.*,
                  SUM(orders.quantity_remaining) OVER (ORDER BY price, fee_bps, id) - orders.quantity_remaining AS quantity
                FROM orders
                WHERE orders.token_set_id = $/tokenSetId/
                  AND orders.side = 'sell'
                  AND orders.fillability_status = 'fillable'
                  AND orders.approval_status = 'approved'
                  AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                  AND orders.currency = '\\x0000000000000000000000000000000000000000'
              ) x WHERE x.quantity < $/quantity/
            `,
            {
              tokenSetId: `token:${query.token}`,
              quantity: query.quantity,
            }
          );
          if (!bestOrdersResult?.length) {
            throw Boom.badRequest("No available orders");
          }

          let totalQuantityToFill = Number(query.quantity);
          for (const {
            id,
            kind,
            quantity_remaining,
            price,
            source_id_int,
            currency,
            raw_data,
          } of bestOrdersResult) {
            const quantityFilled = Math.min(Number(quantity_remaining), totalQuantityToFill);
            totalQuantityToFill -= quantityFilled;

            const totalPrice = bn(price).mul(quantityFilled);
            path.push({
              contract,
              tokenId,
              quantity: quantityFilled,
              source: sources.get(source_id_int)?.name ?? null,
              quote: formatEth(totalPrice.add(totalPrice.mul(query.referrerFeeBps).div(10000))),
            });
            if (query.onlyQuote) {
              // Skip generating any transactions if only the quote was requested
              continue;
            }

            listingDetails.push(
              generateListingDetailsV5(
                {
                  id,
                  kind,
                  currency: fromBuffer(currency),
                  rawData: raw_data,
                },
                {
                  kind: "erc1155",
                  contract,
                  tokenId,
                  amount: quantityFilled,
                }
              )
            );
            confirmationQuery = `?ids=${id}`;
          }

          // No available orders to fill the requested quantity
          if (totalQuantityToFill > 0) {
            throw Boom.badRequest("No available orders");
          }
        }
      }

      const quote = path.map((p) => p.quote).reduce((a, b) => a + b, 0);
      if (query.onlyQuote) {
        // Only return the quote if that's what was requested
        return { quote, path };
      }

      // Use either the source or the old referrer
      if (!query.source && query.referrer !== AddressZero) {
        const source = sources.getByAddress(query.referrer);
        if (source) {
          query.source = source.domain;
        }
      }

      const router = new Sdk.RouterV5.Router(config.chainId, baseProvider, {
        x2y2ApiKey: config.x2y2ApiKey,
        orderFetcherBaseUrl: config.orderFetcherBaseUrl,
      });
      const tx = await router.fillListingsTx(listingDetails, query.taker, {
        source: query.source,
        fee: {
          recipient: query.referrer,
          bps: query.referrerFeeBps,
        },
        partial: query.partial,
        // Force router filling so that we don't lose any attribution
        forceRouter: true,
      });

      // Check that the taker has enough funds to fill all requested tokens
      const balance = await baseProvider.getBalance(query.taker);
      if (!query.skipBalanceCheck && bn(balance).lt(tx.value!)) {
        throw Boom.badData("ETH balance too low to proceed with transaction");
      }

      // Set up generic filling steps
      const steps = [
        {
          action: "Confirm purchase",
          description: "To purchase this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
        },
        {
          action: "Confirmation",
          description: "Verify that the item was successfully purchased",
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
              endpoint: `/orders/executed/v1${confirmationQuery!}`,
              method: "GET",
            },
          },
        ],
        quote,
        path,
      };
    } catch (error) {
      logger.error(`get-execute-buy-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
