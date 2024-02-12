/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { ListingDetails } from "@reservoir0x/sdk/dist/router/v6/types";
import Joi from "joi";

import { inject } from "@/api/index";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, formatPrice, fromBuffer, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";
import { Sources } from "@/models/sources";
import { OrderKind, generateListingDetailsV6 } from "@/orderbook/orders";
import { getCurrency } from "@/utils/currencies";

const version = "v5";

export const getExecuteBuyV5Options: RouteOptions = {
  description: "Buy tokens",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      order: 10,
      deprecated: true,
    },
  },
  validate: {
    payload: Joi.object({
      orderIds: Joi.array().items(Joi.string().lowercase()),
      rawOrders: Joi.array().items(
        Joi.object({
          kind: Joi.string()
            .lowercase()
            .valid("opensea", "looks-rare", "zeroex-v4", "seaport", "x2y2")
            .required(),
          data: Joi.object().required(),
        })
      ),
      tokens: Joi.array()
        .items(Joi.string().lowercase().pattern(regex.token))
        .description(
          "Array of tokens user is buying. Example: `tokens[0]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:704 tokens[1]: 0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:979`"
        ),
      quantity: Joi.number()
        .integer()
        .positive()
        .description(
          "Quantity of tokens user is buying. Only compatible when buying a single ERC1155 token. Example: `5`"
        ),
      taker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description(
          "Address of wallet filling the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      relayer: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Address of wallet relaying the filling transaction"),
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the path will be returned."),
      forceRouter: Joi.boolean().description(
        "If true, all fills will be executed through the router."
      ),
      currency: Joi.string()
        .pattern(regex.address)
        .default(Sdk.Common.Addresses.Native[config.chainId]),
      normalizeRoyalties: Joi.boolean().default(true),
      preferredOrderSource: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .when("tokens", { is: Joi.exist(), then: Joi.allow(), otherwise: Joi.forbidden() })
        .description(
          "If there are multiple listings with equal best price, prefer this source over others.\nNOTE: if you want to fill a listing that is not the best priced, you need to pass a specific order ID."
        ),
      source: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .description("Filling source used for attribution. Example: `reservoir.market`"),
      feesOnTop: Joi.array()
        .items(Joi.string().pattern(regex.fee))
        .description(
          "List of fees (formatted as `feeRecipient:feeAmount`) to be taken when filling. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00:1000000000000000`"
        ),
      partial: Joi.boolean()
        .default(false)
        .description("If true, any off-chain or on-chain errors will be skipped."),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
      skipBalanceCheck: Joi.boolean()
        .default(false)
        .description("If true, balance check will be skipped."),
      x2y2ApiKey: Joi.string().description("Override the X2Y2 API key used for filling."),
    })
      .or("tokens", "orderIds", "rawOrders")
      .oxor("tokens", "orderIds", "rawOrders"),
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
    const payload = request.payload as any;

    try {
      // Handle fees on top
      const feesOnTop: {
        recipient: string;
        amount: string;
      }[] = [];
      let totalFeesOnTop = bn(0);
      for (const fee of payload.feesOnTop ?? []) {
        const [recipient, amount] = fee.split(":");
        feesOnTop.push({ recipient, amount });
        totalFeesOnTop = totalFeesOnTop.add(amount);
      }

      // We need each filled order's source for the path
      const sources = await Sources.getInstance();

      // Keep track of the listings and path to fill
      const listingDetails: ListingDetails[] = [];
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
      const addToPath = async (
        order: {
          id: string;
          kind: OrderKind;
          price: string;
          sourceId: number | null;
          currency: string;
          rawData: string;
          fees?: Sdk.RouterV6.Types.Fee[];
        },
        token: {
          kind: "erc721" | "erc1155";
          contract: string;
          tokenId: string;
          quantity?: number;
        }
      ) => {
        const totalPrice = bn(order.price).mul(token.quantity ?? 1);
        path.push({
          orderId: order.id,
          contract: token.contract,
          tokenId: token.tokenId,
          quantity: token.quantity ?? 1,
          source: order.sourceId !== null ? sources.get(order.sourceId)?.domain ?? null : null,
          currency: order.currency,
          quote: formatPrice(totalPrice, (await getCurrency(order.currency)).decimals),
          rawQuote: totalPrice.toString(),
        });

        listingDetails.push(
          await generateListingDetailsV6(
            {
              id: order.id,
              kind: order.kind,
              currency: order.currency,
              price: order.price,
              source: path[path.length - 1].source ?? undefined,
              rawData: order.rawData,
              fees: payload.normalizeRoyalties ? order.fees : [],
            },
            {
              kind: token.kind,
              contract: token.contract,
              tokenId: token.tokenId,
              amount: token.quantity,
            },
            payload.taker
          )
        );
      };

      // Use a default quantity
      if (!payload.quantity) {
        payload.quantity = 1;
      }

      // Scenario 3: pass raw orders that don't yet exist
      if (payload.rawOrders) {
        // Hack: As raw orders are processed, push them to the `orderIds`
        // field so that they will get handled by the next pipeline step
        // of this same API rather than doing anything custom for it.
        payload.orderIds = [];

        for (const order of payload.rawOrders) {
          const response = await inject({
            method: "POST",
            url: `/order/v2`,
            headers: {
              "Content-Type": "application/json",
            },
            payload: { order },
          }).then((response) => JSON.parse(response.payload));
          if (response.orderId) {
            payload.orderIds.push(response.orderId);
          } else {
            throw Boom.badData("Raw order failed to get processed");
          }
        }
      }

      // Scenario 2: explicitly passing existing orders to fill
      if (payload.orderIds) {
        for (const orderId of payload.orderIds) {
          const orderResult = await redb.oneOrNone(
            `
              SELECT
                orders.kind,
                contracts.kind AS token_kind,
                coalesce(orders.currency_price, orders.price) AS price,
                orders.raw_data,
                orders.source_id_int,
                orders.currency,
                orders.missing_royalties,
                token_sets_tokens.contract,
                token_sets_tokens.token_id
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE orders.id = $/id/
                AND orders.side = 'sell'
                AND orders.fillability_status = 'fillable'
                AND orders.approval_status = 'approved'
                AND orders.quantity_remaining >= $/quantity/
                AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                AND orders.currency = $/currency/
            `,
            {
              id: orderId,
              currency: toBuffer(payload.currency),
              quantity: payload.quantity ?? 1,
            }
          );
          if (!orderResult) {
            if (!payload.partial) {
              // Return an error if the client does not accept partial fills
              throw Boom.badData(`Order ${orderId} not found or not fillable`);
            } else {
              continue;
            }
          }

          if (payload.quantity > 1) {
            if (orderResult.token_kind !== "erc1155") {
              throw Boom.badRequest("Only ERC1155 orders support a quantity");
            }
            if (payload.orderIds.length > 1) {
              throw Boom.badRequest(
                "When specifying a quantity only a single ERC1155 order can get filled"
              );
            }
          }

          await addToPath(
            {
              id: orderId,
              kind: orderResult.kind,
              price: orderResult.price,
              sourceId: orderResult.source_id_int,
              currency: fromBuffer(orderResult.currency),
              rawData: orderResult.raw_data,
              fees: orderResult.missing_royalties,
            },
            {
              kind: orderResult.token_kind,
              contract: fromBuffer(orderResult.contract),
              tokenId: orderResult.token_id,
              quantity: payload.quantity ?? 1,
            }
          );
        }
      }

      // Scenario 3: passing the tokens and quantity to fill
      if (payload.tokens) {
        const preferredOrderSource = sources.getByDomain(payload.preferredOrderSource)?.id;
        for (const token of payload.tokens) {
          const [contract, tokenId] = token.split(":");

          if (payload.quantity === 1) {
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
                  orders.currency,
                  orders.missing_royalties
                FROM orders
                JOIN contracts
                  ON orders.contract = contracts.address
                WHERE orders.token_set_id = $/tokenSetId/
                  AND orders.side = 'sell'
                  AND orders.fillability_status = 'fillable'
                  AND orders.approval_status = 'approved'
                  AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                  AND orders.currency = $/currency/
                ORDER BY orders.value, ${
                  preferredOrderSource
                    ? `(
                        CASE
                          WHEN orders.source_id_int = $/sourceId/ THEN 0
                          ELSE 1
                        END
                      )`
                    : "orders.fee_bps"
                }
                LIMIT 1
              `,
              {
                tokenSetId: `token:${token}`,
                currency: toBuffer(payload.currency),
                sourceId: preferredOrderSource,
              }
            );
            if (!bestOrderResult) {
              throw Boom.badRequest("No available orders");
            }

            const {
              id,
              kind,
              token_kind,
              price,
              source_id_int,
              currency,
              missing_royalties,
              raw_data,
            } = bestOrderResult;

            await addToPath(
              {
                id,
                kind,
                price,
                sourceId: source_id_int,
                currency: fromBuffer(currency),
                rawData: raw_data,
                fees: missing_royalties,
              },
              {
                kind: token_kind,
                contract,
                tokenId,
              }
            );
          } else {
            // Fetch matching orders until the quantity to fill is met
            const bestOrdersResult = await redb.manyOrNone(
              `
                SELECT
                  x.id,
                  x.kind,
                  x.token_kind,
                  coalesce(x.currency_price, x.price) AS price,
                  x.quantity_remaining,
                  x.source_id_int,
                  x.currency,
                  x.missing_royalties,
                  x.raw_data
                FROM (
                  SELECT
                    orders.*,
                    contracts.kind AS token_kind,
                    SUM(orders.quantity_remaining) OVER (
                      ORDER BY
                        price,
                        ${
                          preferredOrderSource
                            ? `(
                                CASE
                                  WHEN orders.source_id_int = $/sourceId/ THEN 0
                                  ELSE 1
                                END
                              )`
                            : "orders.fee_bps"
                        },
                        id
                    ) - orders.quantity_remaining AS quantity
                  FROM orders
                  JOIN contracts
                    ON orders.contract = contracts.address
                  WHERE orders.token_set_id = $/tokenSetId/
                    AND orders.side = 'sell'
                    AND orders.fillability_status = 'fillable'
                    AND orders.approval_status = 'approved'
                    AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                    AND orders.currency = $/currency/
                ) x WHERE x.quantity < $/quantity/
              `,
              {
                tokenSetId: `token:${token}`,
                quantity: payload.quantity,
                currency: toBuffer(payload.currency),
                sourceId: preferredOrderSource,
              }
            );
            if (!bestOrdersResult?.length) {
              throw Boom.badRequest("No available orders");
            }

            if (
              bestOrdersResult.length &&
              bestOrdersResult[0].token_kind === "erc1155" &&
              payload.tokens.length > 1
            ) {
              throw Boom.badData(
                "When specifying a quantity greater than one, only a single ERC1155 token can get filled"
              );
            }

            let totalQuantityToFill = Number(payload.quantity);
            for (const {
              id,
              kind,
              token_kind,
              quantity_remaining,
              price,
              source_id_int,
              currency,
              missing_royalties,
              raw_data,
            } of bestOrdersResult) {
              const quantityFilled = Math.min(Number(quantity_remaining), totalQuantityToFill);
              totalQuantityToFill -= quantityFilled;

              await addToPath(
                {
                  id,
                  kind,
                  price,
                  sourceId: source_id_int,
                  currency: fromBuffer(currency),
                  rawData: raw_data,
                  fees: missing_royalties,
                },
                {
                  kind: token_kind,
                  contract,
                  tokenId,
                  quantity: quantityFilled,
                }
              );
            }

            // No available orders to fill the requested quantity
            if (totalQuantityToFill > 0) {
              throw Boom.badRequest("No available orders");
            }
          }
        }
      }

      if (!path.length) {
        throw Boom.badRequest("No fillable orders");
      }

      if (payload.quantity > 1) {
        if (!listingDetails.every((d) => d.contractKind === "erc1155")) {
          throw Boom.badData("Only ERC1155 tokens support a quantity greater than one");
        }
      }

      if (payload.onlyPath) {
        // Only return the path if that's what was requested
        return { path };
      }

      const router = new Sdk.RouterV6.Router(config.chainId, baseProvider, {
        x2y2ApiKey: payload.x2y2ApiKey ?? config.x2y2ApiKey,
        cbApiKey: config.cbApiKey,
        zeroExApiKey: config.zeroExApiKey,
        nftxApiKey: config.nftxApiKey,
        orderFetcherBaseUrl: config.orderFetcherBaseUrl,
        orderFetcherMetadata: {
          apiKey: await ApiKeyManager.getApiKey(request.headers["x-api-key"]),
        },
      });
      const { txs, success } = await router.fillListingsTx(
        listingDetails,
        payload.taker,
        payload.currency,
        {
          source: payload.source,
          partial: payload.partial,
          forceRouter: payload.forceRouter,
        }
      );

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

      for (const tx of txs) {
        const subPath = path.filter((p) => tx.orderIds.includes(p.orderId));
        const listings = listingDetails.filter((d) => tx.orderIds.includes(d.orderId));

        // Check that the taker has enough funds to fill all requested tokens
        const totalPrice = subPath.map(({ rawQuote }) => bn(rawQuote)).reduce((a, b) => a.add(b));
        if (payload.currency === Sdk.Common.Addresses.Native[config.chainId]) {
          const balance = await baseProvider.getBalance(payload.taker);
          if (!payload.skipBalanceCheck && bn(balance).lt(totalPrice)) {
            throw Boom.badData("Balance too low to proceed with transaction");
          }
        } else {
          const erc20 = new Sdk.Common.Helpers.Erc20(baseProvider, payload.currency);

          const balance = await erc20.getBalance(payload.taker);
          if (!payload.skipBalanceCheck && bn(balance).lt(totalPrice)) {
            throw Boom.badData("Balance too low to proceed with transaction");
          }

          let conduit: string;
          if (
            listings.every((d) => d.kind === "seaport") ||
            listings.every((d) => d.kind === "seaport-v1.4")
          ) {
            // TODO: Have a default conduit for each exchange per chain
            conduit =
              config.chainId === 1
                ? // Use OpenSea's conduit for sharing approvals
                  "0x1e0049783f008a0085193e00003d00cd54003c71"
                : Sdk.SeaportV11.Addresses.Exchange[config.chainId];
          } else {
            throw new Error("Only Seaport ERC20 listings are supported");
          }

          const allowance = await erc20.getAllowance(payload.taker, conduit);
          if (bn(allowance).lt(totalPrice)) {
            const tx = erc20.approveTransaction(payload.taker, conduit);
            steps[0].items.push({
              status: "incomplete",
              data: {
                ...tx,
                from: payload.relayer ? payload.relayer : tx.from,
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
            ...tx.txData,
            from: payload.relayer ? payload.relayer : tx.txData.from,
            maxFeePerGas: payload.maxFeePerGas ? bn(payload.maxFeePerGas).toHexString() : undefined,
            maxPriorityFeePerGas: payload.maxPriorityFeePerGas
              ? bn(payload.maxPriorityFeePerGas).toHexString()
              : undefined,
          },
        });
      }

      return {
        steps,
        // Remove any unsuccessfully handled listings from the path
        path: path.filter((p) => success[p.orderId]),
      };
    } catch (error) {
      logger.error(`get-execute-buy-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
