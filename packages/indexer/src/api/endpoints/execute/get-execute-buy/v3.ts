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
import { bn, formatPrice, fromBuffer, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { generateListingDetailsV5 } from "@/orderbook/orders";
import { getCurrency } from "@/utils/currencies";

const version = "v3";

export const getExecuteBuyV3Options: RouteOptions = {
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
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the path will be returned."),
      forceRouter: Joi.boolean().description(
        "If true, all fills will be executed through the router."
      ),
      currency: Joi.string()
        .pattern(regex.address)
        .default(Sdk.Common.Addresses.Eth[config.chainId]),
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
        orderId: string;
        contract: string;
        tokenId: string;
        quantity: number;
        source: string | null;
        currency: string;
        quote: number;
        rawQuote: string;
      }[] = [];

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
                coalesce(orders.currency_price, orders.price) AS price,
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
                AND orders.currency = $/currency/
              ORDER BY orders.value, orders.fee_bps
              LIMIT 1
            `,
            {
              tokenSetId: `token:${contract}:${tokenId}`,
              currency: toBuffer(query.currency),
            }
          );
          if (!bestOrderResult) {
            // Return early in case no listing is available
            throw Boom.badRequest("No available orders");
          }

          const { id, kind, token_kind, price, source_id_int, currency, raw_data } =
            bestOrderResult;

          const rawQuote = bn(price).add(bn(price).mul(query.referrerFeeBps).div(10000));
          path.push({
            orderId: id,
            contract,
            tokenId,
            quantity: 1,
            source: source_id_int ? sources.get(source_id_int)?.domain ?? null : null,
            currency: fromBuffer(currency),
            quote: formatPrice(rawQuote, (await getCurrency(fromBuffer(currency))).decimals),
            rawQuote: rawQuote.toString(),
          });
          if (query.onlyPath) {
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
                coalesce(x.currency_price, x.price) AS price,
                x.quantity_remaining,
                x.source_id_int,
                x.currency,
                x.raw_data
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
                  AND orders.currency = $/currency/
              ) x WHERE x.quantity < $/quantity/
            `,
            {
              tokenSetId: `token:${query.token}`,
              quantity: query.quantity,
              currency: toBuffer(query.currency),
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
            const rawQuote = totalPrice.add(totalPrice.mul(query.referrerFeeBps).div(10000));
            path.push({
              orderId: id,
              contract,
              tokenId,
              quantity: quantityFilled,
              source: source_id_int ? sources.get(source_id_int)?.name ?? null : null,
              currency: fromBuffer(currency),
              quote: formatPrice(rawQuote, (await getCurrency(fromBuffer(currency))).decimals),
              rawQuote: rawQuote.toString(),
            });
            if (query.onlyPath) {
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
          }

          // No available orders to fill the requested quantity
          if (totalQuantityToFill > 0) {
            throw Boom.badRequest("No available orders");
          }
        }
      }

      if (query.onlyPath) {
        // Only return the path if that's what was requested
        return { path };
      }

      const router = new Sdk.RouterV5.Router(config.chainId, baseProvider, {
        x2y2ApiKey: config.x2y2ApiKey,
        orderFetcherApiKey: config.orderFetcherApiKey,
      });
      const tx = await router.fillListingsTx(listingDetails, query.taker, {
        source: query.source,
        fee: {
          recipient: query.referrer,
          bps: query.referrerFeeBps,
        },
        partial: query.partial,
        forceRouter: query.forceRouter,
        directFillingData: {
          conduitKey:
            config.chainId === 1
              ? "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000"
              : undefined,
        },
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
          action: "Approve exchange contract",
          description: "A one-time setup transaction to enable trading",
          kind: "transaction",
          items: [],
        },
        {
          action: "Confirm purchase",
          description: "To purchase this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
          items: [],
        },
      ];

      // Check that the taker has enough funds to fill all requested tokens
      const totalPrice = path.map(({ rawQuote }) => bn(rawQuote)).reduce((a, b) => a.add(b));
      if (query.currency === Sdk.Common.Addresses.Eth[config.chainId]) {
        const balance = await baseProvider.getBalance(query.taker);
        if (!query.skipBalanceCheck && bn(balance).lt(totalPrice)) {
          throw Boom.badData("Balance too low to proceed with transaction");
        }
      } else {
        const erc20 = new Sdk.Common.Helpers.Erc20(baseProvider, query.currency);

        const balance = await erc20.getBalance(query.taker);
        if (!query.skipBalanceCheck && bn(balance).lt(totalPrice)) {
          throw Boom.badData("Balance too low to proceed with transaction");
        }

        if (!listingDetails.every((d) => d.kind === "seaport")) {
          throw new Error("Only Seaport ERC20 listings are supported");
        }

        const conduit =
          config.chainId === 1
            ? // Use OpenSea's conduit for sharing approvals
              "0x1e0049783f008a0085193e00003d00cd54003c71"
            : Sdk.Seaport.Addresses.Exchange[config.chainId];
        const allowance = await erc20.getAllowance(query.taker, conduit);
        if (bn(allowance).lt(totalPrice)) {
          const tx = erc20.approveTransaction(query.taker, conduit);
          steps[0].items.push({
            status: "incomplete",
            data: {
              ...tx,
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
      logger.error(`get-execute-buy-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
