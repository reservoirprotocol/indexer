import { BigNumber } from "@ethersproject/bignumber";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import * as Permit2 from "@reservoir0x/sdk/dist/router/v6/permits/permit2";
import { ListingDetails } from "@reservoir0x/sdk/dist/router/v6/types";
import Joi from "joi";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, formatPrice, fromBuffer, now, regex } from "@/common/utils";
import { config } from "@/config/index";
import { Sources } from "@/models/sources";
import { OrderKind, generateListingDetailsV6 } from "@/orderbook/orders";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as nftx from "@/orderbook/orders/nftx";
import * as sudoswap from "@/orderbook/orders/sudoswap";
import { getCurrency } from "@/utils/currencies";
import * as onChainData from "@/utils/on-chain-data";
import { getPermitId, getPermit, savePermit } from "@/utils/permits/ft";

const version = "v7";

export const getExecuteBuyV7Options: RouteOptions = {
  description: "Buy tokens (fill listings)",
  tags: ["api", "Router", "x-experimental"],
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
      items: Joi.array()
        .items(
          Joi.object({
            token: Joi.string().lowercase().pattern(regex.token).description("Token to buy."),
            quantity: Joi.number()
              .integer()
              .positive()
              .default(1)
              .description("Quantity of tokens to buy."),
            orderId: Joi.string().lowercase().description("Optional order id to fill."),
            rawOrder: Joi.object({
              kind: Joi.string()
                .lowercase()
                .valid(
                  "opensea",
                  "looks-rare",
                  "zeroex-v4",
                  "seaport",
                  "x2y2",
                  "universe",
                  "rarible",
                  "infinity",
                  "sudoswap",
                  "flow",
                  "nftx"
                )
                .required(),
              data: Joi.object().required(),
            }).description("Optional raw order to fill."),
            preferredOrderSource: Joi.string()
              .lowercase()
              .pattern(regex.domain)
              .when("tokens", { is: Joi.exist(), then: Joi.allow(), otherwise: Joi.forbidden() })
              .description(
                "If there are multiple listings with equal best price, prefer this source over others.\nNOTE: if you want to fill a listing that is not the best priced, you need to pass a specific order id."
              ),
          })
            .oxor("token", "orderId", "rawOrder")
            .or("token", "orderId", "rawOrder")
        )
        .min(1)
        .required()
        .description("List of items to buy."),
      taker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description("Address of wallet filling."),
      relayer: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Address of wallet relaying the fill transaction."),
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the path will be returned."),
      forceRouter: Joi.boolean().description(
        "If true, all fills will be executed through the router."
      ),
      currency: Joi.string()
        .valid(Sdk.Common.Addresses.Eth[config.chainId])
        .description("Currency to be used for purchases."),
      normalizeRoyalties: Joi.boolean().default(false).description("Charge any missing royalties."),
      allowInactiveOrderIds: Joi.boolean()
        .default(false)
        .description(
          "If true, inactive orders will not be skipped over (only relevant when filling via a specific order id)."
        ),
      source: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .description("Filling source used for attribution. Example: `reservoir.market`"),
      feesOnTop: Joi.array()
        .items(Joi.string().pattern(regex.fee))
        .description(
          "List of fees (formatted as `feeRecipient:feeAmount`) to be taken when filling.\nUnless overridden via the `currency` param, the currency used for any fees on top matches the buy-in currency detected by the backend.\nExample: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00:1000000000000000`"
        ),
      partial: Joi.boolean()
        .default(false)
        .description("If true, any off-chain or on-chain errors will be skipped."),
      skipBalanceCheck: Joi.boolean()
        .default(false)
        .description("If true, balance check will be skipped."),
      maxFeePerGas: Joi.string().pattern(regex.number).description("Optional custom gas settings."),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional custom gas settings."),
      // TODO: Allow passing other API keys as well (eg. Coinbase)
      x2y2ApiKey: Joi.string().description("Optional X2Y2 API key used for filling."),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          action: Joi.string().required(),
          description: Joi.string().required(),
          kind: Joi.string().valid("signature", "transaction").required(),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      // Handle fees on top
      const feesOnTop: {
        recipient: string;
        amount: string;
      }[] = [];
      for (const fee of payload.feesOnTop ?? []) {
        const [recipient, amount] = fee.split(":");
        feesOnTop.push({ recipient, amount });
      }

      // Keep track of the listings and path to fill
      const listingDetails: ListingDetails[] = [];
      let path: {
        orderId: string;
        contract: string;
        tokenId: string;
        quantity: number;
        source: string | null;
        currency: string;
        quote: number;
        rawQuote: string;
      }[] = [];

      // Keep track of dynamically-priced orders (eg. from pools like Sudoswap and NFTX)
      const poolPrices: { [pool: string]: string[] } = {};
      // Keep track of the remaining quantities as orders are filled
      const quantityFilled: { [orderId: string]: number } = {};
      // Keep track of the maker balances as orders are filled
      const getMakerBalancesKey = (maker: string, contract: string, tokenId: string) =>
        `${maker}-${contract}-${tokenId}`;
      const makerBalances: { [makerAndToken: string]: BigNumber } = {};
      // TODO: Also keep track of the maker's allowance per exchange

      const sources = await Sources.getInstance();
      const addToPath = async (
        order: {
          id: string;
          kind: OrderKind;
          maker: string;
          price: string;
          sourceId: number | null;
          currency: string;
          rawData: object;
          feesOnTop?: Sdk.RouterV6.Types.Fee[];
        },
        token: {
          kind: "erc721" | "erc1155";
          contract: string;
          tokenId: string;
          quantity?: number;
        }
      ) => {
        const feesOnTop = payload.normalizeRoyalties ? order.feesOnTop ?? [] : [];
        const totalFeeOnTop = feesOnTop
          .map(({ amount }) => bn(amount))
          .reduce((a, b) => a.add(b), bn(0));

        // Handle dynamically-priced orders
        if (["sudoswap", "nftx"].includes(order.kind)) {
          let poolId: string;
          let priceList: string[];

          if (order.kind === "sudoswap") {
            const rawData = order.rawData as Sdk.Sudoswap.OrderParams;
            poolId = rawData.pair;
            priceList = rawData.extra.prices;
          } else {
            const rawData = order.rawData as Sdk.Nftx.Types.OrderParams;
            poolId = rawData.pool;
            priceList = rawData.extra.prices;
          }

          if (!poolPrices[poolId]) {
            poolPrices[poolId] = [];
          }

          // Fetch the price corresponding to the order's index per pool
          const price = priceList[poolPrices[poolId].length];
          // Save the latest price per pool
          poolPrices[poolId].push(price);
          // Override the order's price
          order.price = price;
        }

        // Increment the order's quantity filled
        const quantity = token.quantity ?? 1;
        if (!quantityFilled[order.id]) {
          quantityFilled[order.id] = 0;
        }
        quantityFilled[order.id] += quantity;

        // Decrement the maker's available NFT balance
        const key = getMakerBalancesKey(order.maker, token.contract, token.tokenId);
        if (!makerBalances[key]) {
          makerBalances[key] = await commonHelpers.getNftBalance(
            token.contract,
            token.tokenId,
            order.maker
          );
        }
        makerBalances[key] = makerBalances[key].sub(quantity);

        const totalPrice = bn(order.price).add(totalFeeOnTop).mul(quantity);
        path.push({
          orderId: order.id,
          contract: token.contract,
          tokenId: token.tokenId,
          quantity,
          source: order.sourceId !== null ? sources.get(order.sourceId)?.domain ?? null : null,
          currency: order.currency,
          quote: formatPrice(totalPrice, (await getCurrency(order.currency)).decimals, true),
          rawQuote: totalPrice.toString(),
        });

        listingDetails.push(
          generateListingDetailsV6(
            {
              id: order.id,
              kind: order.kind,
              currency: order.currency,
              rawData: order.rawData,
              fees: feesOnTop,
            },
            {
              kind: token.kind,
              contract: token.contract,
              tokenId: token.tokenId,
              amount: token.quantity,
            }
          )
        );
      };

      const items: {
        token: string;
        quantity: number;
        orderId?: string;
        rawOrder?: {
          kind: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: any;
        };
        preferredOrderSource?: string;
      }[] = payload.items;

      for (const item of items) {
        // Scenario 1: fill via `rawOrder`
        if (item.rawOrder) {
          const order = item.rawOrder;

          // Hack: As the raw order is processed, set it to the `orderId`
          // field so that it will get handled by the next pipeline step
          // of this same API rather than doing anything custom for it.

          // TODO: Handle any other on-chain orderbooks that cannot be "posted"
          if (order.kind === "sudoswap") {
            item.orderId = sudoswap.getOrderId(order.data.pair, "sell", order.data.tokenId);
          } else if (order.kind === "nftx") {
            item.orderId = nftx.getOrderId(order.data.pool, "sell", order.data.specificIds[0]);
          } else {
            const response = await inject({
              method: "POST",
              url: `/order/v2`,
              headers: {
                "Content-Type": "application/json",
                "X-Api-Key": request.headers["x-api-key"],
              },
              payload: { order },
            }).then((response) => JSON.parse(response.payload));
            if (response.orderId) {
              item.orderId = response.orderId;
            } else {
              if (payload.partial) {
                continue;
              } else {
                throw Boom.badData("Raw order failed to get processed");
              }
            }
          }
        }

        // Scenario 2: fill via `orderId`
        if (item.orderId) {
          const result = await idb.oneOrNone(
            `
              SELECT
                orders.kind,
                contracts.kind AS token_kind,
                coalesce(orders.currency_price, orders.price) AS price,
                orders.raw_data,
                orders.source_id_int,
                orders.currency,
                orders.missing_royalties,
                orders.maker,
                token_sets_tokens.contract,
                token_sets_tokens.token_id
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE orders.id = $/id/
                AND orders.side = 'sell'
                AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                AND orders.quantity_remaining >= $/quantity/
                ${
                  payload.allowInactiveOrderIds
                    ? ""
                    : " AND orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'"
                }
            `,
            {
              id: item.orderId,
              quantity: item.quantity,
            }
          );
          if (!result) {
            if (payload.partial) {
              continue;
            } else {
              throw Boom.badData(`Order ${item.orderId} not found or not fillable`);
            }
          }

          await addToPath(
            {
              id: result.id,
              kind: result.kind,
              maker: fromBuffer(result.maker),
              price: result.price,
              sourceId: result.source_id_int,
              currency: fromBuffer(result.currency),
              rawData: result.raw_data,
              feesOnTop: result.missing_royalties,
            },
            {
              kind: result.token_kind,
              contract: fromBuffer(result.contract),
              tokenId: result.token_id,
              quantity: item.quantity,
            }
          );
        }

        // Scenario 3: fill via `token`
        if (item.token) {
          const [contract, tokenId] = item.token.split(":");

          // Fetch all matching orders sorted by price
          const orderResults = await idb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                contracts.kind AS token_kind,
                coalesce(orders.currency_price, orders.price) AS price,
                orders.quantity_remaining,
                orders.source_id_int,
                orders.currency,
                orders.missing_royalties,
                orders.maker,
                orders.raw_data,
                contracts.kind AS token_kind,
                orders.quantity_remaining AS quantity
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              WHERE orders.token_set_id = $/tokenSetId/
                AND orders.side = 'sell'
                AND orders.fillability_status = 'fillable'
                AND orders.approval_status = 'approved'
                AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
              ORDER BY
                ${payload.normalizeRoyalties ? "orders.normalized_value" : "orders.value"},
                ${
                  item.preferredOrderSource
                    ? `(
                        CASE
                          WHEN orders.source_id_int = $/sourceId/ THEN 0
                          ELSE 1
                        END
                      )`
                    : "orders.fee_bps"
                }
              LIMIT 1000
            `,
            {
              tokenSetId: `token:${item.token}`,
              quantity: item.quantity,
              sourceId: item.preferredOrderSource,
            }
          );

          let quantityToFill = item.quantity;
          for (const result of orderResults) {
            // Stop if we filled the total quantity
            if (quantityToFill <= 0) {
              break;
            }

            // Account for the already filled order's quantity
            let availableQuantity = Number(result.quantity_remaining);
            if (quantityFilled[result.id]) {
              availableQuantity -= quantityFilled[result.id];
            }

            // Account for the already filled maker's balance
            const maker = fromBuffer(result.maker);
            const key = getMakerBalancesKey(maker, contract, tokenId);
            if (makerBalances[key]) {
              const makerAvailableQuantity = makerBalances[key].toNumber();
              if (makerAvailableQuantity < availableQuantity) {
                availableQuantity = makerAvailableQuantity;
              }
            }

            // Skip the current order if it has no quantity available
            if (availableQuantity <= 0) {
              continue;
            }

            // Update the quantity to fill with the current order's available quantity
            quantityToFill -= availableQuantity;

            await addToPath(
              {
                id: result.id,
                kind: result.kind,
                maker,
                price: result.price,
                sourceId: result.source_id_int,
                currency: fromBuffer(result.currency),
                rawData: result.raw_data,
                feesOnTop: result.missing_royalties,
              },
              {
                kind: result.token_kind,
                contract,
                tokenId,
                quantity: availableQuantity,
              }
            );
          }

          if (quantityToFill > 0) {
            if (payload.partial) {
              continue;
            } else {
              throw Boom.badData(
                `No available orders for token ${item.token} with quantity ${item.quantity}`
              );
            }
          }
        }
      }

      if (!path.length) {
        throw Boom.badRequest("No available orders");
      }

      let buyInCurrency = payload.currency;
      if (!buyInCurrency) {
        // If no buy-in-currency is specified then we use the following defaults:
        if (path.length === 1) {
          // If a single order is to get filled, we use its currency
          buyInCurrency = path[0].currency;
        } else if (path.every((p) => p.currency === path[0].currency)) {
          // If multiple same-currency orders are to get filled, we use that currency
          buyInCurrency = path[0].currency;
        } else {
          // If multiple different-currency orders are to get filled, we use the native currency
          buyInCurrency = Sdk.Common.Addresses.Eth[config.chainId];
        }
      }

      const router = new Sdk.RouterV6.Router(config.chainId, baseProvider, {
        x2y2ApiKey: payload.x2y2ApiKey ?? config.x2y2ApiKey,
        cbApiKey: config.cbApiKey,
      });
      const { txData, success, approvals, permits } = await router.fillListingsTx(
        listingDetails,
        payload.taker,
        buyInCurrency,
        {
          source: payload.source,
          partial: payload.partial,
          forceRouter: payload.forceRouter,
          relayer: payload.relayer,
          globalFees: feesOnTop,
          // TODO: Move this defaulting to the core SDK
          directFillingData: {
            conduitKey: Sdk.Seaport.Addresses.OpenseaConduitKey[config.chainId],
          },
        }
      );

      // Filter out any non-fillable orders from the path
      path = path.filter((_, i) => success[i]);

      if (!path.length) {
        throw Boom.badRequest("No available orders");
      }

      if (payload.onlyPath) {
        return { path };
      }

      // Set up generic filling steps
      const steps: {
        id: string;
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          data?: object;
        }[];
      }[] = [
        {
          id: "currency-approval",
          action: "Approve exchange contract",
          description: "A one-time setup transaction to enable trading",
          kind: "transaction",
          items: [],
        },
        {
          id: "permit",
          action: "Sign permits",
          description: "Sign permits for accessing the tokens in your wallet",
          kind: "signature",
          items: [],
        },
        {
          id: "sale",
          action: "Confirm transaction in your wallet",
          description: "To purchase this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
          items: [],
        },
      ];

      // Custom gas settings
      const maxFeePerGas = payload.maxFeePerGas
        ? bn(payload.maxFeePerGas).toHexString()
        : undefined;
      const maxPriorityFeePerGas = payload.maxPriorityFeePerGas
        ? bn(payload.maxPriorityFeePerGas).toHexString()
        : undefined;

      for (const approval of approvals) {
        const approvedAmount = await onChainData
          .fetchAndUpdateFtApproval(approval.currency, approval.owner, approval.operator, true)
          .then((a) => a.value);

        const amountToApprove = permits.length
          ? permits
              .map((p) =>
                p.details.data.transferDetails.filter(({ token }) => token === approval.currency)
              )
              .flat()
              .reduce((total, { amount }) => total.add(amount), bn(0))
          : path
              .filter((p) => p.currency === approval.currency)
              .map(({ rawQuote }) => bn(rawQuote))
              .reduce((total, amount) => total.add(amount), bn(0));

        const isApproved = bn(approvedAmount).gte(amountToApprove);
        if (!isApproved) {
          steps[0].items.push({
            status: "incomplete",
            data: {
              ...approval.txData,
              maxFeePerGas,
              maxPriorityFeePerGas,
            },
          });
        }
      }

      const permitHandler = new Permit2.Handler(config.chainId, baseProvider);
      if (permits.length) {
        for (const permit of permits) {
          const id = getPermitId(request.payload as object, permit.currencies);

          let cachedPermit = await getPermit(id);
          if (cachedPermit) {
            // Always use the cached permit details
            permit.details = cachedPermit.details;

            // If the cached permit has a signature attached to it, we can skip it
            const hasSignature = (permit.details.data as Permit2.Data).signature;
            if (hasSignature) {
              continue;
            }
          } else {
            // Cache the permit if it's the first time we encounter it
            await savePermit(
              id,
              permit,
              // Give a 1 minute buffer for the permit to expire
              parseInt(permit.details.data.permitBatch.sigDeadline.toString()) - now() - 60
            );
            cachedPermit = permit;
          }

          steps[1].items.push({
            status: "incomplete",
            data: {
              sign: permitHandler.getSignatureData(cachedPermit.details.data),
              post: {
                endpoint: "/execute/permit-signature/v1",
                method: "POST",
                body: {
                  kind: "ft-permit",
                  id,
                },
              },
            },
          });
        }
      }

      // Get the total price to be paid in the buy-in currency:
      // - orders already denominated in the buy-in currency
      // - permit amounts (which will be denominated in the buy-in currency)
      const totalBuyInCurrencyPrice = path
        .filter(({ currency }) => currency === buyInCurrency)
        .map(({ rawQuote }) => bn(rawQuote))
        .reduce((a, b) => a.add(b), bn(0))
        .add(
          permits
            .map((p) => p.details.data.transferDetails.map((d) => bn(d.amount)))
            .flat()
            .reduce((a, b) => a.add(b), bn(0))
        );

      // Check that the transaction sender has enough funds to fill all requested tokens
      const txSender = payload.relayer ?? payload.taker;
      if (buyInCurrency === Sdk.Common.Addresses.Eth[config.chainId]) {
        const balance = await baseProvider.getBalance(txSender);
        if (!payload.skipBalanceCheck && bn(balance).lt(totalBuyInCurrencyPrice)) {
          throw Boom.badData("Balance too low to proceed with transaction");
        }
      } else {
        const erc20 = new Sdk.Common.Helpers.Erc20(baseProvider, buyInCurrency);
        const balance = await erc20.getBalance(txSender);
        if (!payload.skipBalanceCheck && bn(balance).lt(totalBuyInCurrencyPrice)) {
          throw Boom.badData("Balance too low to proceed with transaction");
        }
      }

      steps[2].items.push({
        status: "incomplete",
        data:
          // Do not return the final step unless all permits have a signature attached
          steps[1].items.length === 0
            ? {
                ...permitHandler.attachToRouterExecution(
                  txData,
                  permits.map((p) => p.details.data)
                ),
                maxFeePerGas,
                maxPriorityFeePerGas,
              }
            : undefined,
      });

      return {
        steps,
        path,
      };
    } catch (error) {
      if (!(error instanceof Boom.Boom)) {
        logger.error(
          `get-execute-buy-${version}-handler`,
          `Handler failure: ${error} (path = ${JSON.stringify({})}, request = ${JSON.stringify(
            payload
          )})`
        );
      }
      throw error;
    }
  },
};
