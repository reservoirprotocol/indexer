/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { inject } from "@/api/index";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, formatPrice, fromBuffer, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { generateBidDetailsV6 } from "@/orderbook/orders";
import { getNftApproval } from "@/orderbook/orders/common/helpers";
import { getCurrency } from "@/utils/currencies";

const version = "v6";

export const getExecuteSellV6Options: RouteOptions = {
  description: "Sell tokens (accept bids)",
  tags: ["api", "Router"],
  timeout: {
    server: 20 * 1000,
  },
  plugins: {
    "hapi-swagger": {
      order: 10,
    },
  },
  validate: {
    payload: Joi.object({
      orderId: Joi.string().lowercase(),
      rawOrder: Joi.object({
        kind: Joi.string()
          .lowercase()
          .valid(
            "opensea",
            "looks-rare",
            "zeroex-v4",
            "seaport",
            "seaport-partial",
            "x2y2",
            "universe"
          )
          .required(),
        data: Joi.object().required(),
      }),
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
      quantity: Joi.number()
        .integer()
        .positive()
        .description(
          "Quantity of tokens user is selling. Only compatible when selling a single ERC1155 token. Example: `5`"
        ),
      source: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .description("Filling source used for attribution. Example: `reservoir.market`"),
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the path will be returned."),
      normalizeRoyalties: Joi.boolean().default(false),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
      x2y2ApiKey: Joi.string().description("Override the X2Y2 API key used for filling."),
    }).oxor("orderId", "rawOrder"),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
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
    const payload = request.payload as any;

    let path: any;
    try {
      let orderResult: any;

      const [contract, tokenId] = payload.token.split(":");

      const tokenResult = await redb.oneOrNone(
        `
          SELECT
            tokens.is_flagged
          FROM tokens
          WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );
      if (!tokenResult) {
        throw Boom.badData("Unknown token");
      }
      if (tokenResult.is_flagged) {
        throw Boom.badData("Token is flagged");
      }

      // Scenario 3: pass raw orders that don't yet exist
      if (payload.rawOrder) {
        // Hack: As the raw order is processed, set it to the `orderId`
        // field so that it will get handled by the next pipeline step
        // of this same API rather than doing anything custom for it.
        payload.orderId = [];

        const response = await inject({
          method: "POST",
          url: `/order/v2`,
          headers: {
            "Content-Type": "application/json",
          },
          payload: { order: payload.rawOrder },
        }).then((response) => JSON.parse(response.payload));
        if (response.orderId) {
          payload.orderId = response.orderId;
        } else {
          throw Boom.badData("Raw order failed to get processed");
        }
      }

      // Scenario 2: explicitly pass an order id to fill
      if (payload.orderId) {
        orderResult = await redb
          .manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                contracts.kind AS token_kind,
                orders.value,
                orders.price,
                orders.raw_data,
                orders.source_id_int,
                orders.currency,
                orders.missing_royalties,
                orders.maker,
                orders.token_set_id
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE orders.id = $/id/
                AND token_sets_tokens.contract = $/contract/
                AND token_sets_tokens.token_id = $/tokenId/
                AND orders.side = 'buy'
                AND orders.fillability_status = 'fillable'
                AND orders.approval_status = 'approved'
                AND orders.quantity_remaining >= $/quantity/
                AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
            `,
            {
              id: payload.orderId,
              contract: toBuffer(contract),
              tokenId,
              quantity: payload.quantity ?? 1,
            }
          )
          // Ideally we just have a `LIMIT 1` on the above query, however for some reason
          // adding that results in extremely low performance:
          // https://stackoverflow.com/questions/21385555/postgresql-query-very-slow-with-limit-1
          .then((result) => result[0]);
      } else {
        // Scenario 3: fetch the best offer on specified current token
        orderResult = await redb
          .manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                contracts.kind AS token_kind,
                orders.value,
                orders.price,
                orders.raw_data,
                orders.source_id_int,
                orders.currency,
                orders.missing_royalties,
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
                AND orders.quantity_remaining >= $/quantity/
                AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
              ORDER BY orders.value DESC
            `,
            {
              contract: toBuffer(contract),
              tokenId,
              quantity: payload.quantity ?? 1,
            }
          )
          // Ideally we just have a `LIMIT 1` on the above query, however for some reason
          // adding that results in extremely low performance:
          // https://stackoverflow.com/questions/21385555/postgresql-query-very-slow-with-limit-1
          .then((result) => result[0]);
      }

      if (payload.quantity) {
        if (orderResult.token_kind !== "erc1155") {
          throw Boom.badRequest("Only ERC1155 orders support a quantity");
        }
      }

      if (!orderResult) {
        throw Boom.badRequest("No available orders");
      }

      const sources = await Sources.getInstance();
      const sourceId = orderResult.source_id_int;

      const fees: Sdk.RouterV6.Types.Fee[] = payload.normalizeRoyalties
        ? orderResult.missing_royalties ?? []
        : [];
      const totalFee = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));

      const totalPrice = bn(orderResult.value)
        .sub(totalFee)
        .mul(payload.quantity ?? 1);
      path = [
        {
          orderId: orderResult.id,
          contract,
          tokenId,
          quantity: payload.quantity ?? 1,
          source: sourceId ? sources.get(sourceId)?.domain ?? null : null,
          currency: fromBuffer(orderResult.currency),
          quote: formatPrice(
            totalPrice,
            (await getCurrency(fromBuffer(orderResult.currency))).decimals
          ),
          rawQuote: totalPrice.toString(),
        },
      ];
      const bidDetails = await generateBidDetailsV6(
        {
          id: orderResult.id,
          kind: orderResult.kind,
          unitPrice: orderResult.price,
          rawData: orderResult.raw_data,
          fees,
        },
        {
          kind: orderResult.token_kind,
          contract,
          tokenId,
          amount: payload.quantity,
        }
      );

      if (payload.onlyPath) {
        // Skip generating any transactions if only the path was requested
        return { path };
      }

      const router = new Sdk.RouterV6.Router(config.chainId, baseProvider, {
        x2y2ApiKey: payload.x2y2ApiKey ?? config.x2y2ApiKey,
        cbApiKey: config.cbApiKey,
      });
      const { txData } = await router.fillBidTx(bidDetails!, payload.taker, {
        source: payload.source,
      });

      // Set up generic filling steps
      const steps: {
        id: string;
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          data?: any;
        }[];
      }[] = [
        {
          id: "nft-approval",
          action: "Approve NFT contract",
          description:
            "Each NFT collection you want to trade requires a one-time approval transaction",
          kind: "transaction",
          items: [],
        },
        {
          id: "sale",
          action: "Accept offer",
          description: "To sell this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
          items: [],
        },
      ];

      // Forward / Rarible bids are to be filled directly (because we have no modules for them yet)
      if (bidDetails.kind === "forward") {
        const isApproved = await getNftApproval(
          bidDetails.contract,
          payload.taker,
          Sdk.Forward.Addresses.Exchange[config.chainId]
        );
        if (!isApproved) {
          const approveTx =
            bidDetails.contractKind === "erc721"
              ? new Sdk.Common.Helpers.Erc721(baseProvider, bidDetails.contract).approveTransaction(
                  payload.taker,
                  Sdk.Forward.Addresses.Exchange[config.chainId]
                )
              : new Sdk.Common.Helpers.Erc1155(
                  baseProvider,
                  bidDetails.contract
                ).approveTransaction(payload.taker, Sdk.Forward.Addresses.Exchange[config.chainId]);

          steps[0].items.push({
            status: "incomplete",
            data: {
              ...approveTx,
              maxFeePerGas: payload.maxFeePerGas
                ? bn(payload.maxFeePerGas).toHexString()
                : undefined,
              maxPriorityFeePerGas: payload.maxPriorityFeePerGas
                ? bn(payload.maxPriorityFeePerGas).toHexString()
                : undefined,
            },
          });
        }
      }
      if (bidDetails.kind === "rarible") {
        const isApproved = await getNftApproval(
          bidDetails.contract,
          payload.taker,
          Sdk.Rarible.Addresses.NFTTransferProxy[config.chainId]
        );
        if (!isApproved) {
          const approveTx =
            bidDetails.contractKind === "erc721"
              ? new Sdk.Common.Helpers.Erc721(baseProvider, bidDetails.contract).approveTransaction(
                  payload.taker,
                  Sdk.Rarible.Addresses.NFTTransferProxy[config.chainId]
                )
              : new Sdk.Common.Helpers.Erc1155(
                  baseProvider,
                  bidDetails.contract
                ).approveTransaction(
                  payload.taker,
                  Sdk.Rarible.Addresses.NFTTransferProxy[config.chainId]
                );

          steps[0].items.push({
            status: "incomplete",
            data: {
              ...approveTx,
              maxFeePerGas: payload.maxFeePerGas
                ? bn(payload.maxFeePerGas).toHexString()
                : undefined,
              maxPriorityFeePerGas: payload.maxPriorityFeePerGas
                ? bn(payload.maxPriorityFeePerGas).toHexString()
                : undefined,
            },
          });
        }
      }

      steps[1].items.push({
        status: "incomplete",
        data: {
          ...txData,
          maxFeePerGas: payload.maxFeePerGas ? bn(payload.maxFeePerGas).toHexString() : undefined,
          maxPriorityFeePerGas: payload.maxPriorityFeePerGas
            ? bn(payload.maxPriorityFeePerGas).toHexString()
            : undefined,
        },
      });

      return {
        steps,
        path,
      };
    } catch (error) {
      logger.error(
        `get-execute-sell-${version}-handler`,
        `Handler failure: ${error} (path = ${JSON.stringify(path)}, request = ${JSON.stringify(
          payload
        )})`
      );
      throw error;
    }
  },
};
