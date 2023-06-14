/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, formatEth, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";
import { Sources } from "@/models/sources";
import { generateBidDetailsV6 } from "@/orderbook/orders";
import { getNftApproval } from "@/orderbook/orders/common/helpers";

const version = "v5";

export const getExecuteSellV5Options: RouteOptions = {
  description: "Sell tokens (accept bids)",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 10,
      deprecated: true,
    },
  },
  validate: {
    payload: Joi.object({
      orderId: Joi.string().lowercase(),
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
    const payload = request.payload as any;

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

      // Scenario 1: explicitly passing an existing order to fill
      if (payload.orderId) {
        orderResult = await redb.oneOrNone(
          `
            SELECT
              orders.id,
              orders.kind,
              contracts.kind AS token_kind,
              orders.price,
              orders.raw_data,
              orders.source_id_int,
              orders.maker,
              orders.token_set_id,
              orders.fee_bps
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
            LIMIT 1
          `,
          {
            id: payload.orderId,
            contract: toBuffer(contract),
            tokenId,
            quantity: payload.quantity ?? 1,
          }
        );
      } else {
        // Fetch the best offer on specified current token
        orderResult = await redb.oneOrNone(
          `
            SELECT
              orders.id,
              orders.kind,
              contracts.kind AS token_kind,
              orders.price,
              orders.raw_data,
              orders.source_id_int,
              orders.maker,
              orders.token_set_id,
              orders.fee_bps
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
              ${payload.normalizeRoyalties ? " AND orders.normalized_value IS NOT NULL" : ""}
              AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
            ORDER BY orders.value DESC
            LIMIT 1
          `,
          {
            contract: toBuffer(contract),
            tokenId,
            quantity: payload.quantity ?? 1,
          }
        );
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
      const source = sourceId ? sources.get(sourceId)?.domain ?? null : null;

      const path = [
        {
          orderId: orderResult.id,
          contract,
          tokenId,
          quantity: payload.quantity ?? 1,
          source,
          // TODO: Add support for multiple currencies
          currency: Sdk.Common.Addresses.Weth[config.chainId],
          quote: formatEth(orderResult.price),
          rawQuote: orderResult.price,
        },
      ];
      const bidDetails = await generateBidDetailsV6(
        {
          id: orderResult.id,
          kind: orderResult.kind,
          unitPrice: orderResult.price,
          rawData: orderResult.raw_data,
          source: source || undefined,
          builtInFeeBps: orderResult.fee_bps,
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
        orderFetcherBaseUrl: config.orderFetcherBaseUrl,
        orderFetcherMetadata: {
          apiKey: await ApiKeyManager.getApiKey(request.headers["x-api-key"]),
        },
      });
      const { txs } = await router.fillBidsTx([bidDetails!], payload.taker, {
        source: payload.source,
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

      // Rarible bids are to be filled directly (because we have no modules for them yet)
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
          ...txs[0].txData,
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
      logger.error(`get-execute-sell-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
