/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { ListingDetails } from "@reservoir0x/sdk/dist/router/types";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, formatEth, fromBuffer, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";

const version = "v1";

export const getExecuteBuyV1Options: RouteOptions = {
  description: "Buy any token at the best available price",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
      token: Joi.string().lowercase().pattern(regex.token),
      quantity: Joi.number().integer().positive(),
      tokens: Joi.array().items(Joi.string().lowercase().pattern(regex.token)),
      taker: Joi.string().lowercase().pattern(regex.address).required(),
      onlyQuote: Joi.boolean().default(false),
      source: Joi.string().lowercase(),
      referrer: Joi.string().lowercase().pattern(regex.address).default(AddressZero),
      referrerFeeBps: Joi.number().integer().positive().min(0).max(10000).default(0),
      partial: Joi.boolean().default(false),
      maxFeePerGas: Joi.string().pattern(regex.number),
      maxPriorityFeePerGas: Joi.string().pattern(regex.number),
      skipBalanceCheck: Joi.boolean().default(false),
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

      // HACK: The confirmation query for the whole multi buy batch can
      // be the confirmation query of any token within the batch (under
      // the asumption that all sub-fills will succeed).
      let confirmationQuery: string;

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
      const addListingDetail = (
        kind: string,
        contractKind: "erc721" | "erc1155",
        contract: string,
        tokenId: string,
        currency: string,
        amount: number,
        rawData: any
      ) => {
        const common = {
          contractKind,
          contract,
          tokenId,
          currency,
          amount,
        };

        switch (kind) {
          case "foundation": {
            return listingDetails.push({
              kind: "foundation",
              ...common,
              order: new Sdk.Foundation.Order(config.chainId, rawData),
            });
          }

          case "looks-rare": {
            return listingDetails.push({
              kind: "looks-rare",
              ...common,
              order: new Sdk.LooksRare.Order(config.chainId, rawData),
            });
          }

          case "opendao-erc721":
          case "opendao-erc1155": {
            return listingDetails.push({
              kind: "opendao",
              ...common,
              order: new Sdk.OpenDao.Order(config.chainId, rawData),
            });
          }

          case "x2y2": {
            return listingDetails.push({
              kind: "x2y2",
              ...common,
              order: new Sdk.X2Y2.Order(config.chainId, rawData),
            });
          }

          case "zeroex-v4-erc721":
          case "zeroex-v4-erc1155": {
            return listingDetails.push({
              kind: "zeroex-v4",
              ...common,
              order: new Sdk.ZeroExV4.Order(config.chainId, rawData),
            });
          }

          case "seaport": {
            return listingDetails.push({
              kind: "seaport",
              ...common,
              order: new Sdk.Seaport.Order(config.chainId, rawData),
            });
          }
        }
      };

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
              ORDER BY orders.value
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
            source: sources.get(source_id_int)?.name,
            quote: formatEth(bn(price).add(bn(price).mul(query.referrerFeeBps).div(10000))),
          });
          if (query.onlyQuote) {
            // Skip generating any transactions if only the quote was requested
            continue;
          }

          addListingDetail(kind, token_kind, contract, tokenId, fromBuffer(currency), 1, raw_data);
          confirmationQuery = `?ids=${id}`;
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
                  SUM(orders.quantity_remaining) OVER (ORDER BY price, id) - orders.quantity_remaining AS quantity
                FROM orders
                WHERE orders.token_set_id = $/tokenSetId/
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
              source: sources.get(source_id_int)?.name,
              quote: formatEth(totalPrice.add(totalPrice.mul(query.referrerFeeBps).div(10000))),
            });
            if (query.onlyQuote) {
              // Skip generating any transactions if only the quote was requested
              continue;
            }

            addListingDetail(
              kind,
              "erc1155",
              contract,
              tokenId,
              fromBuffer(currency),
              quantityFilled,
              raw_data
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

      const router = new Sdk.Router.Router(config.chainId, baseProvider);
      const tx = await router.fillListingsTx(listingDetails, query.taker, {
        referrer: query.source,
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
