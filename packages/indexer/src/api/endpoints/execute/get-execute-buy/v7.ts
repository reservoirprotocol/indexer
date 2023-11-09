import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, HashZero, MaxUint256 } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { PermitHandler } from "@reservoir0x/sdk/dist/router/v6/permit";
import {
  FillListingsResult,
  ListingDetails,
  MintDetails,
} from "@reservoir0x/sdk/dist/router/v6/types";
import { estimateGas } from "@reservoir0x/sdk/dist/router/v6/utils";
import { getRandomBytes } from "@reservoir0x/sdk/dist/utils";
import axios from "axios";
import { randomUUID } from "crypto";
import Joi from "joi";
import _ from "lodash";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiExecuteFee } from "@/common/joi";
import { baseProvider } from "@/common/provider";
import { bn, formatPrice, fromBuffer, now, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";
import { FeeRecipients } from "@/models/fee-recipients";
import { Sources } from "@/models/sources";
import * as mints from "@/orderbook/mints";
import {
  PartialCollectionMint,
  generateCollectionMintTxData,
  normalizePartialCollectionMint,
} from "@/orderbook/mints/calldata";
import { getNFTTransferEvents } from "@/orderbook/mints/simulation";
import { OrderKind, generateListingDetailsV6 } from "@/orderbook/orders";
import { fillErrorCallback, getExecuteError } from "@/orderbook/orders/errors";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as nftx from "@/orderbook/orders/nftx";
import * as sudoswap from "@/orderbook/orders/sudoswap";
import * as b from "@/utils/auth/blur";
import * as e from "@/utils/auth/erc721c";
import { getCurrency } from "@/utils/currencies";
import * as erc721c from "@/utils/erc721c";
import { ExecutionsBuffer } from "@/utils/executions";
import * as onChainData from "@/utils/on-chain-data";
import { getEphemeralPermitId, getEphemeralPermit, saveEphemeralPermit } from "@/utils/permits";
import { getPreSignatureId, getPreSignature, savePreSignature } from "@/utils/pre-signatures";
import { getUSDAndCurrencyPrices } from "@/utils/prices";

const version = "v7";

export const getExecuteBuyV7Options: RouteOptions = {
  description: "Buy tokens (fill listings)",
  notes:
    "Use this API to fill listings. We recommend using the SDK over this API as the SDK will iterate through the steps and return callbacks. Please mark `excludeEOA` as `true` to exclude Blur orders.",
  tags: ["api", "Fill Orders (buy & sell)"],
  timeout: {
    server: 40 * 1000,
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
            collection: Joi.string().lowercase().description("Collection to buy."),
            token: Joi.string().lowercase().pattern(regex.token).description("Token to buy."),
            quantity: Joi.number().integer().positive().description("Quantity of tokens to buy."),
            orderId: Joi.string().lowercase().description("Optional order id to fill."),
            rawOrder: Joi.object({
              kind: Joi.string()
                .lowercase()
                .valid(
                  "opensea",
                  "blur-partial",
                  "looks-rare",
                  "zeroex-v4",
                  "seaport",
                  "seaport-v1.4",
                  "seaport-v1.5",
                  "x2y2",
                  "rarible",
                  "sudoswap",
                  "nftx",
                  "alienswap",
                  "mint"
                ),
              data: Joi.object(),
            }).description("Optional raw order to fill."),
            fillType: Joi.string()
              .valid("trade", "mint", "preferMint")
              .default("preferMint")
              .description(
                "Optionally specify a particular fill method. Only relevant when filling via `collection`."
              ),
            preferredOrderSource: Joi.string()
              .lowercase()
              .pattern(regex.domain)
              .when("token", { is: Joi.exist(), then: Joi.allow(), otherwise: Joi.forbidden() })
              .description(
                "If there are multiple listings with equal best price, prefer this source over others.\nNOTE: if you want to fill a listing that is not the best priced, you need to pass a specific order id or use `exactOrderSource`."
              ),
            exactOrderSource: Joi.string()
              .lowercase()
              .pattern(regex.domain)
              .when("token", { is: Joi.exist(), then: Joi.allow(), otherwise: Joi.forbidden() })
              .description("Only consider orders from this source."),
            exclusions: Joi.array()
              .items(
                Joi.object({
                  orderId: Joi.string().required(),
                  price: Joi.string().pattern(regex.number),
                })
              )
              .description("Items to exclude"),
          })
            .oxor("token", "collection", "orderId", "rawOrder")
            .or("token", "collection", "orderId", "rawOrder")
            .oxor("preferredOrderSource", "exactOrderSource")
        )
        .min(1)
        .required()
        .description("List of items to buy."),
      taker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description("Address of wallet filling (receiver of the NFT)."),
      relayer: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Address of wallet relaying the fill transaction (paying for the NFT)."),
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the path will be returned."),
      forceRouter: Joi.boolean().description(
        "If true, all fills will be executed through the router (where possible)"
      ),
      currency: Joi.string().lowercase().description("Currency to be used for purchases."),
      currencyChainId: Joi.number().description("The chain id of the purchase currency"),
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
      excludeEOA: Joi.boolean()
        .default(false)
        .description(
          "Exclude orders that can only be filled by EOAs, to support filling with smart contracts. If marked `true`, blur will be excluded."
        ),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description(
          "Optional custom gas settings. Includes base fee & priority fee in this limit."
        ),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional custom gas settings."),
      usePermit: Joi.boolean().description("When true, will use permit to avoid approvals."),
      swapProvider: Joi.string()
        .valid("uniswap", "1inch")
        .default("uniswap")
        .description(
          "Choose a specific swapping provider when buying in a different currency (defaults to `uniswap`)"
        ),
      executionMethod: Joi.string().valid("seaport-intent"),
      referrer: Joi.string()
        .pattern(regex.address)
        .optional()
        .description("Referrer address (where supported)"),
      comment: Joi.string().optional().description("Mint comment (where suported)"),
      // Various authorization keys
      x2y2ApiKey: Joi.string().description("Optional X2Y2 API key used for filling."),
      openseaApiKey: Joi.string().description(
        "Optional OpenSea API key used for filling. You don't need to pass your own key, but if you don't, you are more likely to be rate-limited."
      ),
      blurAuth: Joi.string().description(
        "Advanced use case to pass personal blurAuthToken; the API will generate one if left empty."
      ),
    }),
  },
  response: {
    schema: Joi.object({
      requestId: Joi.string(),
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          action: Joi.string().required(),
          description: Joi.string().required(),
          kind: Joi.string().valid("signature", "transaction").required(),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string()
                  .valid("complete", "incomplete")
                  .required()
                  .description("Response is `complete` or `incomplete`."),
                tip: Joi.string(),
                orderIds: Joi.array().items(Joi.string()),
                data: Joi.object(),
                gasEstimate: Joi.number().description(
                  "Approximation of gas used (only applies to `transaction` items)"
                ),
                check: Joi.object({
                  endpoint: Joi.string().required(),
                  method: Joi.string().valid("POST").required(),
                  body: Joi.any(),
                }).description("The details of the endpoint for checking the status of the step"),
              })
            )
            .required(),
        })
      ),
      errors: Joi.array().items(
        Joi.object({
          message: Joi.string(),
          orderId: Joi.string(),
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
          currencySymbol: Joi.string().optional().allow(null),
          currencyDecimals: Joi.number().optional().allow(null),
          quote: Joi.number().unsafe(),
          rawQuote: Joi.string().pattern(regex.number),
          buyInCurrency: Joi.string().lowercase().pattern(regex.address),
          buyInCurrencySymbol: Joi.string().optional().allow(null),
          buyInCurrencyDecimals: Joi.number().optional().allow(null),
          buyInQuote: Joi.number().unsafe(),
          buyInRawQuote: Joi.string().pattern(regex.number),
          totalPrice: Joi.number().unsafe(),
          totalRawPrice: Joi.string().pattern(regex.number),
          gasCost: Joi.string().pattern(regex.number),
          builtInFees: Joi.array()
            .items(JoiExecuteFee)
            .description("Can be marketplace fees or royalties"),
          feesOnTop: Joi.array().items(JoiExecuteFee).description("Can be referral fees."),
          fromChainId: Joi.number().description("Chain id buying from"),
        })
      ),
      maxQuantities: Joi.array().items(
        Joi.object({
          itemIndex: Joi.number().required(),
          maxQuantity: Joi.string().pattern(regex.number).allow(null),
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

    const perfTime1 = performance.now();

    try {
      type ExecuteFee = {
        kind?: string;
        recipient: string;
        bps?: number;
        amount: number;
        rawAmount: string;
      };

      // Keep track of the listings and path to fill
      const listingDetails: ListingDetails[] = [];
      let path: {
        orderId: string;
        contract: string;
        tokenId?: string;
        quantity: number;
        source: string | null;
        currency: string;
        currencySymbol?: string;
        currencyDecimals?: number;
        // Gross price (without fees on top) = price
        quote: number;
        rawQuote: string;
        buyInCurrency?: string;
        buyInCurrencySymbol?: string;
        buyInCurrencyDecimals?: number;
        buyInQuote?: number;
        buyInRawQuote?: string;
        // Total price (with fees on top) = price + feesOnTop
        totalPrice?: number;
        totalRawPrice?: string;
        builtInFees: ExecuteFee[];
        feesOnTop: ExecuteFee[];
        gasCost?: string;
        fromChainId?: number;
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
      const feeRecipients = await FeeRecipients.getInstance();

      // Save the fill source if it doesn't exist yet
      if (payload.source) {
        await sources.getOrInsert(payload.source);
      }

      const addToPath = async (
        order: {
          id: string;
          kind: OrderKind;
          maker: string;
          nativePrice: string;
          price: string;
          sourceId: number | null;
          currency: string;
          rawData: object;
          builtInFees: { kind: string; recipient: string; bps: number }[];
          additionalFees?: Sdk.RouterV6.Types.Fee[];
        },
        token: {
          kind: "erc721" | "erc1155";
          contract: string;
          tokenId?: string;
          quantity?: number;
        }
      ) => {
        // Handle dynamically-priced orders
        if (
          ["sudoswap", "sudoswap-v2", "collectionxyz", "nftx", "caviar-v1"].includes(order.kind)
        ) {
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
          const price = priceList[Math.min(poolPrices[poolId].length, priceList.length - 1)];
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

        if (order.kind !== "mint") {
          // Decrement the maker's available NFT balance
          const key = getMakerBalancesKey(order.maker, token.contract, token.tokenId!);
          if (!makerBalances[key]) {
            makerBalances[key] = await commonHelpers.getNftBalance(
              token.contract,
              token.tokenId!,
              order.maker
            );
          }
          makerBalances[key] = makerBalances[key].sub(quantity);
        }

        const unitPrice = bn(order.price);
        const additionalFees = payload.normalizeRoyalties ? order.additionalFees ?? [] : [];
        const builtInFees = order.builtInFees ?? [];

        const feeOnTop = additionalFees
          .map(({ amount }) => bn(amount))
          .reduce((a, b) => a.add(b), bn(0));

        const totalPrice = unitPrice.add(feeOnTop);
        const currency = await getCurrency(order.currency);
        path.push({
          orderId: order.id,
          contract: token.contract,
          tokenId: token.tokenId,
          quantity,
          source: order.sourceId !== null ? sources.get(order.sourceId)?.domain ?? null : null,
          currency: order.currency,
          currencySymbol: currency.symbol,
          currencyDecimals: currency.decimals,
          quote: formatPrice(totalPrice, currency.decimals, true),
          rawQuote: totalPrice.toString(),
          builtInFees: builtInFees.map((f) => {
            const rawAmount = unitPrice.mul(f.bps).div(10000).toString();
            const amount = formatPrice(rawAmount, currency.decimals);

            return {
              ...f,
              amount,
              rawAmount,
            };
          }),
          feesOnTop: [
            // For now, the only additional fees are the normalized royalties
            ...additionalFees.map((f) => ({
              kind: "royalty",
              recipient: f.recipient,
              bps: bn(f.amount).mul(10000).div(unitPrice).toNumber(),
              amount: formatPrice(f.amount, currency.decimals, true),
              rawAmount: bn(f.amount).toString(),
            })),
          ],
        });

        if (order.kind !== "mint") {
          const flaggedResult = await idb.oneOrNone(
            `
              SELECT
                tokens.is_flagged
              FROM tokens
              WHERE tokens.contract = $/contract/
                AND tokens.token_id = $/tokenId/
              LIMIT 1
            `,
            {
              contract: toBuffer(token.contract),
              tokenId: token.tokenId,
            }
          );

          listingDetails.push(
            generateListingDetailsV6(
              {
                id: order.id,
                kind: order.kind,
                currency: order.currency,
                price: order.price,
                source: path[path.length - 1].source ?? undefined,
                rawData: order.rawData,
                fees: additionalFees,
              },
              {
                kind: token.kind,
                contract: token.contract,
                tokenId: token.tokenId!,
                amount: token.quantity,
                isFlagged: Boolean(flaggedResult.is_flagged),
              }
            )
          );
        }
      };

      const items: {
        token?: string;
        collection?: string;
        orderId?: string;
        rawOrder?: {
          kind: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: any;
        };
        quantity: number;
        preferredOrderSource?: string;
        exactOrderSource?: string;
        exclusions?: {
          orderId: string;
        }[];
        fillType?: "trade" | "mint" | "preferMint";
        originalItemIndex?: number;
      }[] = payload.items;

      // Keep track of any mint transactions that need to be aggregated
      const mintDetails: MintDetails[] = [];

      // Keep track of the maximum quantity available per item
      // (only relevant when the below `preview` field is true)
      const maxQuantities: {
        itemIndex: number;
        maxQuantity: string | null;
      }[] = [];
      const preview = payload.onlyPath && payload.partial && items.every((i) => !i.quantity);

      const useSeaportIntent = payload.executionMethod === "seaport-intent";
      const useCrossChainIntent =
        payload.currencyChainId !== undefined && payload.currencyChainId !== config.chainId;

      let lastError: string | undefined;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemIndex =
          items[i].originalItemIndex !== undefined ? items[i].originalItemIndex! : i;

        if (!item.quantity) {
          if (preview) {
            item.quantity = useSeaportIntent || useCrossChainIntent ? 1 : 30;
          } else {
            item.quantity = 1;
          }
        }

        // Scenario 1: fill via `rawOrder`
        if (item.rawOrder) {
          const order = item.rawOrder;

          // Hack: As the raw order is processed, set it to the `orderId`
          // field so that it will get handled by the next pipeline step
          // of this same API rather than doing anything custom for it.

          // TODO: Handle any other on-chain orderbooks that cannot be "posted"
          if (order.kind === "mint") {
            const rawMint = order.data as PartialCollectionMint;

            const collectionData = await idb.oneOrNone(
              `
                SELECT
                  contracts.kind AS token_kind
                FROM collections
                JOIN contracts
                  ON collections.contract = contracts.address
                WHERE collections.id = $/id/
              `,
              {
                id: rawMint.collection,
              }
            );
            if (collectionData) {
              const collectionMint = normalizePartialCollectionMint(rawMint);

              const { txData, price } = await generateCollectionMintTxData(
                collectionMint,
                payload.taker,
                item.quantity,
                {
                  comment: payload.comment,
                  referrer: payload.referrer,
                }
              );

              const orderId = `mint:${collectionMint.collection}`;
              mintDetails.push({
                orderId,
                txData,
                fees: [],
                token: collectionMint.contract,
                quantity: item.quantity,
                comment: payload.comment,
              });

              await addToPath(
                {
                  id: orderId,
                  kind: "mint",
                  maker: collectionMint.contract,
                  nativePrice: price,
                  price: price,
                  sourceId: null,
                  currency: collectionMint.currency,
                  rawData: {},
                  builtInFees: [],
                  additionalFees: [],
                },
                {
                  kind: collectionData.token_kind,
                  contract: collectionMint.contract,
                  quantity: item.quantity,
                }
              );

              if (preview) {
                // The max quantity is the amount mintable on the collection
                maxQuantities.push({
                  itemIndex,
                  maxQuantity: null,
                });
              }
            }
          } else if (order.kind === "sudoswap") {
            item.orderId = sudoswap.getOrderId(order.data.pair, "sell", order.data.tokenId);
          } else if (order.kind === "nftx") {
            item.orderId = nftx.getOrderId(order.data.pool, "sell", order.data.specificIds[0]);
          } else if (order.kind === "blur-partial") {
            await addToPath(
              {
                id: keccak256(
                  ["string", "address", "uint256"],
                  ["blur", order.data.contract, order.data.tokenId]
                ),
                kind: "blur",
                maker: AddressZero,
                nativePrice: order.data.price,
                price: order.data.price,
                sourceId: sources.getByDomain("blur.io")?.id ?? null,
                currency: Sdk.Common.Addresses.Native[config.chainId],
                rawData: order.data,
                builtInFees: [],
              },
              {
                kind: "erc721",
                contract: order.data.contract,
                tokenId: order.data.tokenId,
              }
            );

            if (preview) {
              // Blur only supports ERC721 listings so max quantity is always 1
              maxQuantities.push({
                itemIndex,
                maxQuantity: "1",
              });
            }
          } else {
            const response = await inject({
              method: "POST",
              url: `/order/v3`,
              headers: {
                "Content-Type": "application/json",
                "X-Api-Key": request.headers["x-api-key"],
              },
              payload: { order },
            }).then((response) => JSON.parse(response.payload));
            if (response.orderId) {
              item.orderId = response.orderId;
            } else {
              lastError = "Raw order failed to get processed";
              if (payload.partial) {
                continue;
              } else {
                throw getExecuteError(lastError);
              }
            }
          }
        }

        // Scenario 2: fill via `orderId`
        if (item.orderId) {
          const result = await idb.oneOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                contracts.kind AS token_kind,
                orders.price AS native_price,
                coalesce(orders.currency_price, orders.price) AS price,
                orders.raw_data,
                orders.source_id_int,
                orders.currency,
                orders.missing_royalties,
                orders.maker,
                orders.fee_breakdown,
                orders.fillability_status,
                orders.approval_status,
                orders.quantity_remaining,
                token_sets_tokens.contract,
                token_sets_tokens.token_id
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE orders.id = $/id/
                AND orders.side = 'sell'
                AND (
                  orders.taker IS NULL
                  OR orders.taker = '\\x0000000000000000000000000000000000000000'
                  OR orders.taker = $/taker/
                )
                ${item.exclusions?.length ? " AND orders.id NOT IN ($/excludedOrderIds:list/)" : ""}
            `,
            {
              taker: toBuffer(payload.taker),
              id: item.orderId,
              excludedOrderIds: item.exclusions?.map((e) => e.orderId) ?? [],
            }
          );

          let error: string | undefined;
          if (!result) {
            error = "No fillable orders";
          } else {
            // Check fillability
            if (!error && !payload.allowInactiveOrderIds) {
              if (
                result.fillability_status === "no-balance" ||
                result.approval_status === "no-approval"
              ) {
                error = "Order is inactive (insufficient balance or approval) and can't be filled";
              } else if (result.fillability_status === "filled") {
                error = "Order has been filled";
              } else if (result.fillability_status === "cancelled") {
                error = "Order has been cancelled";
              } else if (result.fillability_status === "expired") {
                error = "Order has expired";
              } else if (
                result.fillability_status !== "fillable" ||
                result.approval_status !== "approved"
              ) {
                error = "No fillable orders";
              }
            }

            // Check taker
            if (!error) {
              if (fromBuffer(result.maker) === payload.taker) {
                error = "No fillable orders (taker cannot fill own orders)";
              }
            }

            // Check quantity
            if (!error) {
              if (bn(result.quantity_remaining).lt(item.quantity)) {
                if (!payload.partial) {
                  error = "Unable to fill requested quantity";
                } else {
                  // Fill as much as we can from the order
                  item.quantity = result.quantity_remaining;
                }
              }
            }
          }

          if (error) {
            lastError = error;
            if (payload.partial) {
              continue;
            } else {
              throw getExecuteError(lastError);
            }
          }

          await addToPath(
            {
              id: result.id,
              kind: result.kind,
              maker: fromBuffer(result.maker),
              nativePrice: result.native_price,
              price: result.price,
              sourceId: result.source_id_int,
              currency: fromBuffer(result.currency),
              rawData: result.raw_data,
              builtInFees: result.fee_breakdown,
              additionalFees: result.missing_royalties,
            },
            {
              kind: result.token_kind,
              contract: fromBuffer(result.contract),
              tokenId: result.token_id,
              quantity: item.quantity,
            }
          );

          if (preview) {
            // The max quantity is the quantity still fillable on the order
            maxQuantities.push({
              itemIndex,
              maxQuantity: result.quantity_remaining,
            });
          }
        }

        // Scenario 3: fill via `collection`
        if (item.collection) {
          let mintAvailable = false;
          let hasActiveMints = false;
          if (item.fillType === "mint" || item.fillType === "preferMint") {
            const collectionData = await idb.oneOrNone(
              `
                SELECT
                  contracts.kind AS token_kind
                FROM collections
                JOIN contracts
                  ON collections.contract = contracts.address
                WHERE collections.id = $/id/
              `,
              {
                id: item.collection,
              }
            );
            if (collectionData) {
              // Fetch any open mints on the collection which the taker is elligible for
              const openMints = await mints.getCollectionMints(item.collection, {
                status: "open",
              });

              for (const mint of openMints) {
                if (!payload.currency || mint.currency === payload.currency) {
                  const amountMintable = await mints.getAmountMintableByWallet(mint, payload.taker);
                  let quantityToMint = bn(
                    amountMintable
                      ? amountMintable.lt(item.quantity)
                        ? amountMintable
                        : item.quantity
                      : item.quantity
                  ).toNumber();

                  // If minting by collection was request but the current mint is tied to a token,
                  // only mint a single quantity of the current token in order to mimick the logic
                  // of buying by collection (where we choose as many token ids as the quantity)
                  if (mint.tokenId) {
                    quantityToMint = Math.min(quantityToMint, 1);
                  }

                  if (quantityToMint > 0) {
                    try {
                      const { txData, price } = await generateCollectionMintTxData(
                        mint,
                        payload.taker,
                        quantityToMint,
                        {
                          comment: payload.comment,
                          referrer: payload.referrer,
                        }
                      );

                      const orderId = `mint:${item.collection}`;
                      mintDetails.push({
                        orderId,
                        txData,
                        fees: [],
                        token: mint.contract,
                        quantity: quantityToMint,
                        comment: payload.comment,
                      });

                      await addToPath(
                        {
                          id: orderId,
                          kind: "mint",
                          maker: mint.contract,
                          nativePrice: price,
                          price: price,
                          sourceId: null,
                          currency: mint.currency,
                          rawData: {},
                          builtInFees: [],
                          additionalFees: [],
                        },
                        {
                          kind: collectionData.token_kind,
                          contract: mint.contract,
                          quantity: quantityToMint,
                        }
                      );

                      if (preview) {
                        // The max quantity is the amount mintable on the collection
                        maxQuantities.push({
                          itemIndex,
                          maxQuantity: mint.tokenId
                            ? quantityToMint.toString()
                            : amountMintable
                            ? amountMintable.toString()
                            : null,
                        });
                      }

                      item.quantity -= quantityToMint;
                      mintAvailable = true;
                    } catch {
                      // Skip errors
                      // Mostly coming from allowlist mints for which the user is not authorized
                      // TODO: Have an allowlist check instead of handling it via `try` / `catch`
                    }
                  }

                  hasActiveMints = true;
                }
              }
            }

            if (item.quantity > 0) {
              if (!hasActiveMints) {
                lastError = "Collection has no eligible mints";
              } else {
                lastError =
                  "Unable to mint requested quantity (max mints per wallet possibly exceeded)";
              }

              if (!payload.partial && mintAvailable) {
                throw getExecuteError(lastError);
              }
            }
          }

          if (item.fillType === "trade" || (item.fillType === "preferMint" && !mintAvailable)) {
            // Filtering by collection on the `orders` table is inefficient, so what we
            // do here is select the cheapest tokens from the `tokens` table and filter
            // out the ones that aren't fillable. For this to work we fetch more tokens
            // than we need, so we can filter out the ones that aren't fillable and not
            // end up with too few tokens.

            const redundancyFactor = 10;
            const tokenResults = await idb.manyOrNone(
              `
                WITH x AS (
                  SELECT
                    tokens.contract,
                    tokens.token_id,
                    ${
                      payload.normalizeRoyalties
                        ? "tokens.normalized_floor_sell_id"
                        : "tokens.floor_sell_id"
                    } AS order_id
                  FROM tokens
                  WHERE tokens.collection_id = $/collection/
                  ORDER BY ${
                    payload.normalizeRoyalties
                      ? "tokens.normalized_floor_sell_value"
                      : "tokens.floor_sell_value"
                  }
                  LIMIT $/quantity/ * ${redundancyFactor}
                )
                SELECT
                  x.contract,
                  x.token_id
                FROM x
                JOIN orders
                  ON x.order_id = orders.id
                WHERE orders.fillability_status = 'fillable'
                  AND orders.approval_status = 'approved'
                  AND orders.maker != $/taker/
                LIMIT $/quantity/
              `,
              {
                collection: item.collection,
                quantity: item.quantity,
                taker: toBuffer(payload.taker),
              }
            );

            if (preview) {
              // The max quantity is the total number of tokens which can be bought from the collection
              maxQuantities.push({
                itemIndex: itemIndex,
                maxQuantity: await idb
                  .one(
                    `
                      SELECT
                        count(*) AS on_sale_count
                      FROM tokens
                      WHERE tokens.collection_id = $/collection/
                        AND ${
                          payload.normalizeRoyalties
                            ? "tokens.normalized_floor_sell_value"
                            : "tokens.floor_sell_value"
                        } IS NOT NULL
                    `,
                    {
                      collection: item.collection,
                    }
                  )
                  .then((r) => String(r.on_sale_count)),
              });
            }

            // Add each retrieved token as a new item so that it will get
            // processed by the next pipeline of the same API rather than
            // building something custom for it.

            for (
              let i = 0;
              i <
              Math.min(
                useCrossChainIntent || useSeaportIntent ? item.quantity : tokenResults.length,
                tokenResults.length
              );
              i++
            ) {
              const t = tokenResults[i];
              items.push({
                token: `${fromBuffer(t.contract)}:${t.token_id}`,
                fillType: item.fillType,
                quantity: 1,
                originalItemIndex: itemIndex,
              });
            }

            if (tokenResults.length < item.quantity) {
              lastError = "Unable to fill requested quantity";
              if (!payload.partial) {
                throw getExecuteError(lastError);
              }
            }
          }
        }

        // Scenario 4: fill via `token`
        if (item.token) {
          const [contract, tokenId] = item.token.split(":");

          let mintAvailable = false;
          let hasActiveMints = false;
          if (item.fillType === "mint" || item.fillType === "preferMint") {
            const collectionData = await idb.oneOrNone(
              `
                SELECT
                  collections.id,
                  contracts.kind AS token_kind
                FROM tokens
                JOIN collections
                  ON tokens.collection_id = collections.id
                JOIN contracts
                  ON collections.contract = contracts.address
                WHERE tokens.contract = $/contract/
                  AND tokens.token_id = $/tokenId/
              `,
              {
                contract: toBuffer(contract),
                tokenId,
              }
            );
            if (collectionData) {
              // Fetch any open mints on the token which the taker is elligible for
              const openMints = await mints.getCollectionMints(collectionData.id, {
                status: "open",
                tokenId,
              });

              for (const mint of openMints) {
                if (!payload.currency || mint.currency === payload.currency) {
                  const amountMintable = await mints.getAmountMintableByWallet(mint, payload.taker);

                  const quantityToMint = bn(
                    amountMintable
                      ? amountMintable.lt(item.quantity)
                        ? amountMintable
                        : item.quantity
                      : item.quantity
                  ).toNumber();

                  if (quantityToMint > 0) {
                    try {
                      const { txData, price } = await generateCollectionMintTxData(
                        mint,
                        payload.taker,
                        quantityToMint,
                        {
                          comment: payload.comment,
                          referrer: payload.referrer,
                        }
                      );

                      const orderId = `mint:${collectionData.id}`;
                      mintDetails.push({
                        orderId,
                        txData,
                        fees: [],
                        token: mint.contract,
                        quantity: quantityToMint,
                        comment: payload.comment,
                      });

                      await addToPath(
                        {
                          id: orderId,
                          kind: "mint",
                          maker: mint.contract,
                          nativePrice: price,
                          price: price,
                          sourceId: null,
                          currency: mint.currency,
                          rawData: {},
                          builtInFees: [],
                          additionalFees: [],
                        },
                        {
                          kind: collectionData.token_kind,
                          contract: mint.contract,
                          tokenId,
                          quantity: quantityToMint,
                        }
                      );

                      if (preview) {
                        // The max quantity is the amount mintable on the collection
                        maxQuantities.push({
                          itemIndex,
                          maxQuantity: amountMintable ? amountMintable.toString() : null,
                        });
                      }

                      item.quantity -= quantityToMint;
                      mintAvailable = true;
                    } catch {
                      // Skip errors
                      // Mostly coming from allowlist mints for which the user is not authorized
                      // TODO: Have an allowlist check instead of handling it via `try` / `catch`
                    }
                  }

                  hasActiveMints = true;
                }
              }
            }

            if (item.quantity > 0) {
              if (!hasActiveMints) {
                lastError = "Token has no eligible mints";
              } else {
                lastError =
                  "Unable to mint requested quantity (max mints per wallet possibly exceeded)";
              }

              if (!payload.partial && mintAvailable) {
                throw getExecuteError(lastError);
              }
            }
          }

          if (item.fillType === "trade" || (item.fillType === "preferMint" && !mintAvailable)) {
            // TODO: Right now we filter out Blur orders since those don't yet
            // support royalty normalization. A better approach to handling it
            // would be to set the normalized fields to `null` for every order
            // which doesn't support royalty normalization and then filter out
            // such `null` fields in various normalized events/caches.

            // Only one of `exactOrderSource` and `preferredOrderSource` will be set
            const sourceDomain = item.exactOrderSource || item.preferredOrderSource;

            // Keep track of the max fillable quantity
            let maxQuantity = bn(0);

            // Fetch all matching orders sorted by price
            const orderResults = await idb.manyOrNone(
              `
                SELECT
                  orders.id,
                  orders.kind,
                  contracts.kind AS token_kind,
                  orders.price AS native_price,
                  coalesce(orders.currency_price, orders.price) AS price,
                  orders.quantity_remaining,
                  orders.source_id_int,
                  orders.currency,
                  orders.missing_royalties,
                  orders.maker,
                  orders.raw_data,
                  orders.fee_breakdown,
                  contracts.kind AS token_kind,
                  orders.quantity_remaining AS quantity
                FROM orders
                JOIN contracts
                  ON orders.contract = contracts.address
                WHERE orders.token_set_id = $/tokenSetId/
                  AND orders.side = 'sell'
                  AND orders.fillability_status = 'fillable'
                  AND orders.approval_status = 'approved'
                  AND (
                    orders.taker IS NULL
                    OR orders.taker = '\\x0000000000000000000000000000000000000000'
                    OR orders.taker = $/taker/
                  )
                  ${
                    payload.normalizeRoyalties || payload.excludeEOA
                      ? " AND orders.kind != 'blur'"
                      : ""
                  }
                  ${item.exactOrderSource ? " AND orders.source_id_int = $/sourceId/" : ""}
                  ${
                    item.exclusions?.length
                      ? " AND orders.id NOT IN ($/excludedOrderIds:list/)"
                      : ""
                  }
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
                sourceId: sourceDomain ? sources.getByDomain(sourceDomain)?.id ?? -1 : undefined,
                taker: toBuffer(payload.taker),
                excludedOrderIds: item.exclusions?.map((e) => e.orderId) ?? [],
              }
            );

            let quantityToFill = item.quantity;
            let makerEqualsTakerQuantity = 0;
            for (const result of orderResults) {
              if (fromBuffer(result.maker) === payload.taker) {
                makerEqualsTakerQuantity += Number(result.quantity_remaining);
                continue;
              }

              // Stop if we filled the total quantity
              if (quantityToFill <= 0 && (!preview || useCrossChainIntent || useSeaportIntent)) {
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

              await addToPath(
                {
                  id: result.id,
                  kind: result.kind,
                  maker,
                  nativePrice: result.native_price,
                  price: result.price,
                  sourceId: result.source_id_int,
                  currency: fromBuffer(result.currency),
                  rawData: result.raw_data,
                  builtInFees: result.fee_breakdown,
                  additionalFees: result.missing_royalties,
                },
                {
                  kind: result.token_kind,
                  contract,
                  tokenId,
                  quantity: preview
                    ? availableQuantity
                    : Math.min(quantityToFill, availableQuantity),
                }
              );
              maxQuantity = maxQuantity.add(availableQuantity);

              // Update the quantity to fill with the current order's available quantity
              quantityToFill -= availableQuantity;
            }

            if (quantityToFill > 0) {
              if (makerEqualsTakerQuantity >= quantityToFill) {
                lastError = "No fillable orders (taker cannot fill own orders)";
              } else {
                lastError = "Unable to fill requested quantity";
              }

              if (!payload.partial) {
                throw getExecuteError(lastError);
              }
            }

            if (preview) {
              if (!maxQuantities.find((m) => m.itemIndex === itemIndex)) {
                maxQuantities.push({
                  itemIndex,
                  maxQuantity: maxQuantity.toString(),
                });
              }
            }
          }
        }
      }

      if (!path.length) {
        throw getExecuteError(lastError ?? "No fillable orders");
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
          buyInCurrency = Sdk.Common.Addresses.Native[config.chainId];
        }
      }

      // Include the global fees in the path

      const globalFees = (payload.feesOnTop ?? []).map((fee: string) => {
        const [recipient, amount] = fee.split(":");
        return { recipient, amount };
      });

      if (payload.source) {
        for (const globalFee of globalFees) {
          await feeRecipients.getOrInsert(globalFee.recipient, payload.source, "marketplace");
        }
      }

      const hasBlurListings = listingDetails.some((b) => b.source === "blur.io");
      const ordersEligibleForGlobalFees = listingDetails
        .filter(
          (b) =>
            b.source !== "blur.io" && (hasBlurListings ? !["opensea.io"].includes(b.source!) : true)
        )
        .map((b) => b.orderId);

      const addGlobalFee = async (
        detail: ListingDetails,
        item: (typeof path)[0],
        fee: Sdk.RouterV6.Types.Fee
      ) => {
        // The fees should be relative to a single quantity
        let feeAmount = bn(fee.amount).div(item.quantity).toString();

        // Global fees get split across all eligible orders
        let adjustedFeeAmount = bn(feeAmount).div(ordersEligibleForGlobalFees.length).toString();

        // If the item's currency is not the same with the buy-in currency,
        if (item.currency !== buyInCurrency) {
          feeAmount = await getUSDAndCurrencyPrices(
            buyInCurrency,
            item.currency,
            feeAmount,
            now()
          ).then((p) => p.currencyPrice!);
          adjustedFeeAmount = await getUSDAndCurrencyPrices(
            buyInCurrency,
            item.currency,
            adjustedFeeAmount,
            now()
          ).then((p) => p.currencyPrice!);
        }

        const amount = formatPrice(
          adjustedFeeAmount,
          (await getCurrency(item.currency)).decimals,
          true
        );
        const rawAmount = bn(adjustedFeeAmount).toString();

        // To avoid numeric overflow
        const maxBps = 10000;
        const bps = bn(feeAmount).mul(10000).div(item.rawQuote);

        item.feesOnTop.push({
          recipient: fee.recipient,
          bps: bps.gt(maxBps) ? undefined : bps.toNumber(),
          amount,
          rawAmount,
        });

        item.totalPrice = (item.totalPrice ?? item.quote) + amount;
        item.totalRawPrice = bn(item.totalRawPrice ?? item.rawQuote)
          .add(rawAmount)
          .toString();

        // item.quote += amount;
        // item.rawQuote = bn(item.rawQuote).add(rawAmount).toString();

        if (!detail.fees) {
          detail.fees = [];
        }
        detail.fees.push({
          recipient: fee.recipient,
          amount: rawAmount,
        });
      };

      for (const item of path) {
        if (globalFees.length && ordersEligibleForGlobalFees.includes(item.orderId)) {
          for (const f of globalFees) {
            const detail = listingDetails.find((d) => d.orderId === item.orderId);
            if (detail) {
              await addGlobalFee(detail, item, f);
            }
          }
        } else {
          item.totalPrice = item.quote;
          item.totalRawPrice = item.rawQuote;
        }
      }

      // Add the quotes in the "buy-in" currency to the path items
      for (const item of path) {
        if (item.currency !== buyInCurrency) {
          const buyInPrices = await getUSDAndCurrencyPrices(
            item.currency,
            buyInCurrency,
            item.rawQuote,
            now(),
            {
              acceptStalePrice: true,
            }
          );

          if (buyInPrices.currencyPrice) {
            const c = await getCurrency(buyInCurrency);
            item.buyInCurrency = c.contract;
            item.buyInCurrencyDecimals = c.decimals;
            item.buyInCurrencySymbol = c.symbol;
            item.buyInQuote = formatPrice(buyInPrices.currencyPrice, c.decimals, true);
            item.buyInRawQuote = buyInPrices.currencyPrice;
          }
        }
      }

      type StepType = {
        id: string;
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          tip?: string;
          orderIds?: string[];
          data?: object;
          gasEstimate?: number;
          check?: {
            endpoint: string;
            method: "POST";
            body: object;
          };
        }[];
      };

      // Set up generic filling steps
      let steps: StepType[] = [
        {
          id: "auth",
          action: "Sign in",
          description: "Some marketplaces require signing an auth message before filling",
          kind: "signature",
          items: [],
        },
        {
          id: "currency-approval",
          action: "Approve exchange contract",
          description: "A one-time setup transaction to enable trading",
          kind: "transaction",
          items: [],
        },
        {
          id: "currency-permit",
          action: "Sign permits",
          description: "Sign permits for accessing the tokens in your wallet",
          kind: "signature",
          items: [],
        },
        {
          id: "pre-signature",
          action: "Sign data",
          description: "Some exchanges require signing additional data before filling",
          kind: "signature",
          items: [],
        },
        {
          id: "auth-transaction",
          action: "On-chain verification",
          description: "Some marketplaces require triggering an auth transaction before filling",
          kind: "transaction",
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

      if (!payload.onlyPath) {
        try {
          // Simulate filling via seaport / cross-chain intent for testing things
          if (
            !payload.skipBalanceCheck &&
            items.length === 1 &&
            items[0].token &&
            items[0].fillType !== "mint"
          ) {
            const seaportSimulate = async () => {
              if (config.seaportSolverBaseUrl) {
                await axios.post(
                  `${config.seaportSolverBaseUrl}/intents/simulate`,
                  {
                    chainId: config.chainId,
                    token: items[0].token,
                  },
                  { timeout: 500 }
                );
              }
            };
            const crossChainSimulate = async () => {
              if (config.crossChainSolverBaseUrl) {
                await axios.post(
                  `${config.crossChainSolverBaseUrl}/intents/simulate`,
                  {
                    chainId: config.chainId,
                    token: items[0].token,
                  },
                  { timeout: 500 }
                );
              }
            };

            await Promise.all([seaportSimulate(), crossChainSimulate()]);
          }
        } catch {
          // Skip errors
        }
      }

      if (payload.onlyPath && !useSeaportIntent && !useCrossChainIntent) {
        return {
          path,
          maxQuantities: preview ? maxQuantities : undefined,
        };
      }

      // Seaport intent purchasing MVP
      if (useSeaportIntent) {
        if (!config.seaportSolverBaseUrl) {
          throw Boom.badRequest("Intent purchasing not supported");
        }

        if (listingDetails.length > 1) {
          throw Boom.badRequest("Only single token intent purchases are supported");
        }

        const details = listingDetails[0];
        if (details.currency !== Sdk.Common.Addresses.Native[config.chainId]) {
          throw Boom.badRequest("Only native token intent purchases are supported");
        }
        if (details.contractKind !== "erc721") {
          throw Boom.badRequest("Only erc721 token intent purchases are supported");
        }

        const item = path[0];

        const { quote, gasCost } = await axios
          .post(`${config.seaportSolverBaseUrl}/intents/quote`, {
            chainId: config.chainId,
            token: `${details.contract}:${details.tokenId}`,
            amount: details.amount ?? "1",
          })
          .then((response) => ({ quote: response.data.price, gasCost: response.data.gasCost }));

        item.totalPrice = formatPrice(quote);
        item.totalRawPrice = quote;
        item.gasCost = gasCost;

        if (payload.onlyPath) {
          return {
            path,
            maxQuantities: preview ? maxQuantities : undefined,
          };
        }

        const order = new Sdk.SeaportV15.Order(config.chainId, {
          offerer: payload.taker,
          zone: AddressZero,
          offer: [
            {
              itemType: Sdk.SeaportBase.Types.ItemType.ERC20,
              token: Sdk.Common.Addresses.WNative[config.chainId],
              identifierOrCriteria: "0",
              startAmount: quote.toString(),
              endAmount: quote.toString(),
            },
          ],
          consideration: [
            {
              itemType: Sdk.SeaportBase.Types.ItemType.ERC721,
              token: path[0].contract,
              identifierOrCriteria: path[0].tokenId!,
              startAmount: "1",
              endAmount: "1",
              recipient: payload.taker,
            },
            ...((payload.feesOnTop ?? []) as string[])
              .map((f) => {
                const [recipient, amount] = f.split(":");
                return { amount, recipient };
              })
              .map(({ amount, recipient }) => ({
                itemType: Sdk.SeaportBase.Types.ItemType.ERC20,
                token: Sdk.Common.Addresses.WNative[config.chainId],
                identifierOrCriteria: "0",
                startAmount: amount.toString(),
                endAmount: amount.toString(),
                recipient,
              })),
          ],
          orderType: Sdk.SeaportBase.Types.OrderType.FULL_OPEN,
          startTime: Math.floor(Date.now() / 1000),
          endTime: Math.floor(Date.now() / 1000) + 5 * 60,
          zoneHash: HashZero,
          salt: getRandomBytes(20).toString(),
          conduitKey: Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId],
          counter: (
            await new Sdk.SeaportV15.Exchange(config.chainId).getCounter(
              baseProvider,
              payload.taker
            )
          ).toString(),
          totalOriginalConsiderationItems: 1 + (details.fees?.length ?? 0),
        });

        steps[3].items.push({
          status: "incomplete",
          data: {
            sign: order.getSignatureData(),
            post: {
              endpoint: "/execute/solve/v1",
              method: "POST",
              body: {
                kind: "seaport-intent",
                order: order.params,
              },
            },
          },
          check: {
            endpoint: "/execute/status/v1",
            method: "POST",
            body: {
              kind: "seaport-intent",
              id: order.hash(),
            },
          },
        });

        return {
          steps: steps.filter((s) => s.items.length),
          path,
        };
      }

      // Cross-chain intent purchasing MVP
      if (useCrossChainIntent) {
        if (!config.crossChainSolverBaseUrl) {
          throw Boom.badRequest("Cross-chain purchasing not supported");
        }

        if (buyInCurrency !== Sdk.Common.Addresses.Native[config.chainId]) {
          throw Boom.badRequest("Only native currency is supported for cross-chain purchasing");
        }

        if (path.length > 1) {
          throw Boom.badRequest("Only single item cross-chain purchases are supported");
        }

        if (payload.normalizeRoyalties) {
          throw Boom.badRequest(
            "Royalty normalization is not supported when purchasing cross-chain"
          );
        }

        if (payload.feeOnTop) {
          throw Boom.badRequest("Fees on top are not supported when purchasing cross-chain");
        }

        const fromChainId = payload.currencyChainId;
        const toChainId = config.chainId;

        const ccConfig: {
          enabled: boolean;
          solver?: string;
          availableBalance?: string;
          maxPricePerItem?: string;
        } = await axios
          .get(
            `${config.crossChainSolverBaseUrl}/config?fromChainId=${fromChainId}&toChainId=${toChainId}&user=${payload.taker}`
          )
          .then((response) => response.data);

        if (!ccConfig.enabled) {
          throw Boom.badRequest("Cross-chain swap not supported between requested chains");
        }

        const item = path[0];

        // Only set when minting
        const isCollectionRequest = item.orderId.startsWith("mint");

        let tokenId = item.tokenId;

        if (isCollectionRequest && !tokenId) {
          // Hacky way to support "range" collections like ones from artblocks engine
          if (item.orderId.match(/^mint:0x[a-f0-9]{40}:\d+:\d+$/g)) {
            const [, , startTokenId, endTokenId] = item.orderId.split(":");
            tokenId = bn(
              "0x111111111111111111111111" +
                Number(startTokenId).toString(16).padStart(20, "0") +
                Number(endTokenId).toString(16).padStart(20, "0")
            ).toString();
          } else {
            tokenId = MaxUint256.toString();
          }
        }

        const token = `${item.contract}:${tokenId}`.toLowerCase();

        const { quote, gasCost } = await axios
          .post(`${config.crossChainSolverBaseUrl}/intents/quote`, {
            fromChainId,
            toChainId,
            isCollectionRequest,
            token,
            amount: item.quantity,
          })
          .then((response) => ({
            quote: response.data.price,
            gasCost: response.data.gasCost,
          }))
          .catch((error) => {
            throw Boom.badRequest(
              error.response?.data ? JSON.stringify(error.response.data) : "Error getting quote"
            );
          });

        if (ccConfig.maxPricePerItem && bn(quote).gt(ccConfig.maxPricePerItem)) {
          throw Boom.badRequest("Price too high to purchase cross-chain");
        }

        item.fromChainId = fromChainId;
        item.gasCost = gasCost;

        if (payload.onlyPath) {
          return {
            path,
            maxQuantities: preview ? maxQuantities : undefined,
          };
        }

        const customSteps: StepType[] = [
          {
            id: "sale",
            action: "Confirm transaction in your wallet",
            description: "Deposit funds for purchasing cross-chain",
            kind: "transaction",
            items: [],
          },
          {
            id: "order-signature",
            action: "Authorize cross-chain request",
            description: "A free off-chain signature to create the request",
            kind: "signature",
            items: [],
          },
        ];

        const order = new Sdk.CrossChain.Order(fromChainId, {
          isCollectionRequest,
          maker: payload.taker,
          solver: ccConfig.solver!,
          token: item.contract,
          tokenId: item.tokenId ?? MaxUint256.toString(),
          amount: String(item.quantity),
          price: quote,
          recipient: payload.taker,
          chainId: config.chainId,
          deadline: now() + 30 * 60,
          salt: getRandomBytes(20).toString(),
        });

        if (bn(ccConfig.availableBalance!).lte(quote)) {
          const exchange = new Sdk.CrossChain.Exchange(fromChainId);
          customSteps[0].items.push({
            status: "incomplete",
            data: {
              ...exchange.depositAndPrevalidateTx(
                payload.taker,
                ccConfig.solver!,
                bn(quote).sub(ccConfig.availableBalance!).toString(),
                order
              ),
              chainId: fromChainId,
            },
            check: {
              endpoint: "/execute/status/v1",
              method: "POST",
              body: {
                kind: "cross-chain-intent",
                id: order.hash(),
              },
            },
          });
        } else {
          customSteps[1].items.push({
            status: "incomplete",
            data: {
              sign: order.getSignatureData(),
              post: {
                endpoint: "/execute/solve/v1",
                method: "POST",
                body: {
                  kind: "cross-chain-intent",
                  order: order.params,
                  chainId: fromChainId,
                },
              },
            },
            check: {
              endpoint: "/execute/status/v1",
              method: "POST",
              body: {
                kind: "cross-chain-intent",
                id: order.hash(),
              },
            },
          });
        }

        return {
          steps: customSteps.filter((s) => s.items.length),
          path,
        };
      }

      // Handle Blur authentication
      let blurAuth: b.Auth | undefined;
      if (path.some((p) => p.source === "blur.io")) {
        if (payload.blurAuth) {
          blurAuth = { accessToken: payload.blurAuth };
        } else {
          const blurAuthId = b.getAuthId(payload.taker);

          blurAuth = await b.getAuth(blurAuthId);
          if (!blurAuth) {
            const blurAuthChallengeId = b.getAuthChallengeId(payload.taker);

            let blurAuthChallenge = await b.getAuthChallenge(blurAuthChallengeId);
            if (!blurAuthChallenge) {
              blurAuthChallenge = (await axios
                .get(`${config.orderFetcherBaseUrl}/api/blur-auth-challenge?taker=${payload.taker}`)
                .then((response) => response.data.authChallenge)) as b.AuthChallenge;

              await b.saveAuthChallenge(
                blurAuthChallengeId,
                blurAuthChallenge,
                // Give a 1 minute buffer for the auth challenge to expire
                Math.floor(new Date(blurAuthChallenge?.expiresOn).getTime() / 1000) - now() - 60
              );
            }

            steps[0].items.push({
              status: "incomplete",
              data: {
                sign: {
                  signatureKind: "eip191",
                  message: blurAuthChallenge.message,
                },
                post: {
                  endpoint: "/execute/auth-signature/v1",
                  method: "POST",
                  body: {
                    kind: "blur",
                    id: blurAuthChallengeId,
                  },
                },
              },
            });

            // Force the client to poll
            steps[1].items.push({
              status: "incomplete",
              tip: "This step is dependent on a previous step. Once you've completed it, re-call the API to get the data for this step.",
            });

            // Return early since any next steps are dependent on the Blur auth
            return {
              steps,
              path,
            };
          }
        }

        steps[0].items.push({
          status: "complete",
        });

        // No need to have the hacky fix here since for Blur the next step will always be "sale"
      }

      // Handle ERC721C authentication
      const unverifiedERC721CTransferValidators: string[] = [];
      await Promise.all(
        listingDetails.map(async (d) => {
          try {
            const config = await erc721c.getERC721CConfigFromDB(d.contract);
            if (config && [4, 6].includes(config.transferSecurityLevel)) {
              const isVerified = await erc721c.isVerifiedEOA(
                config.transferValidator,
                payload.taker
              );
              if (!isVerified) {
                unverifiedERC721CTransferValidators.push(config.transferValidator);
              }
            }
          } catch {
            // Skip errors
          }
        })
      );
      if (unverifiedERC721CTransferValidators.length) {
        const erc721cAuthId = e.getAuthId(payload.taker);

        const erc721cAuth = await e.getAuth(erc721cAuthId);
        if (!erc721cAuth) {
          const erc721cAuthChallengeId = e.getAuthChallengeId(payload.taker);

          let erc721cAuthChallenge = await e.getAuthChallenge(erc721cAuthChallengeId);
          if (!erc721cAuthChallenge) {
            erc721cAuthChallenge = {
              message: "EOA",
              walletAddress: payload.taker,
            };

            await e.saveAuthChallenge(
              erc721cAuthChallengeId,
              erc721cAuthChallenge,
              // Give a 10 minute buffer for the auth challenge to expire
              10 * 60
            );
          }

          steps[0].items.push({
            status: "incomplete",
            data: {
              sign: {
                signatureKind: "eip191",
                message: erc721cAuthChallenge.message,
              },
              post: {
                endpoint: "/execute/auth-signature/v1",
                method: "POST",
                body: {
                  kind: "erc721c",
                  id: erc721cAuthChallengeId,
                },
              },
            },
          });

          // Force the client to poll
          steps[1].items.push({
            status: "incomplete",
            tip: "This step is dependent on a previous step. Once you've completed it, re-call the API to get the data for this step.",
          });

          // Return early since any next steps are dependent on the ERC721C auth
          return {
            steps,
            path,
          };
        }

        steps[0].items.push({
          status: "complete",
        });
        steps[1].items.push({
          status: "complete",
          // Hacky fix for: https://github.com/reservoirprotocol/reservoir-kit/pull/391
          data: {},
        });
      }

      const router = new Sdk.RouterV6.Router(config.chainId, baseProvider, {
        x2y2ApiKey: payload.x2y2ApiKey ?? config.x2y2ApiKey,
        openseaApiKey: payload.openseaApiKey,
        cbApiKey: config.cbApiKey,
        orderFetcherBaseUrl: config.orderFetcherBaseUrl,
        orderFetcherMetadata: {
          apiKey: await ApiKeyManager.getApiKey(request.headers["x-api-key"]),
        },
      });

      const errors: { orderId: string; message: string }[] = [];

      let result: FillListingsResult;
      try {
        result = await router.fillListingsTx(listingDetails, payload.taker, buyInCurrency, {
          source: payload.source,
          partial: payload.partial,
          forceRouter: payload.forceRouter,
          relayer: payload.relayer,
          usePermit: payload.usePermit,
          swapProvider: payload.swapProvider,
          blurAuth,
          onError: async (kind, error, data) => {
            errors.push({
              orderId: data.orderId,
              message: error.response?.data ? JSON.stringify(error.response.data) : error.message,
            });
            await fillErrorCallback(kind, error, data);
          },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        throw getExecuteError(error.message, errors);
      }

      const { txs, success } = result;

      // Add any mint transactions
      if (mintDetails.length) {
        if (!result.txs.length) {
          for (const md of mintDetails) {
            for (const fee of globalFees) {
              md.fees.push({
                recipient: fee.recipient,
                amount: bn(fee.amount).div(mintDetails.length).toString(),
              });
            }
          }
        }

        let mintsResult = await router.fillMintsTx(mintDetails, payload.taker, {
          source: payload.source,
          partial: payload.partial,
          relayer: payload.relayer,
        });

        // Minting via a smart contract proxy is complicated.
        // There are a lot of things that could go wrong:
        // - collection disallows minting from a smart contract
        // - the mint method is not standard (eg. not calling the standard ERC721/1155 hooks)

        // For this reason, before returning the router module calldata
        // we simulate it and make sure that a few conditions are met:
        // - there is at least one successful mint
        // - all minted tokens have the taker as the final owner (eg. nothing gets stuck in the router / module)

        let safeToUse = true;
        for (const { txData } of mintsResult.txs) {
          const events = await getNFTTransferEvents(txData);
          if (!events.length) {
            // At least one successful mint
            safeToUse = false;
          } else {
            // Every token landed in the taker's wallet
            const uniqueTokens = [
              ...new Set(events.map((e) => `${e.contract}:${e.tokenId}`)).values(),
            ].map((t) => t.split(":"));
            for (const [contract, tokenId] of uniqueTokens) {
              if (
                !events.find(
                  (e) => e.contract === contract && e.tokenId === tokenId && e.to === payload.taker
                )
              ) {
                safeToUse = false;
                break;
              }
            }
          }
        }

        if (!safeToUse) {
          if (payload.relayer) {
            throw Boom.badRequest("Relayer not supported for requested mints");
          }

          mintsResult = await router.fillMintsTx(mintDetails, payload.taker, {
            source: payload.source,
            forceDirectFilling: true,
          });
        }

        txs.push(
          ...mintsResult.txs.map(({ txData, orderIds }) => ({
            txData,
            orderIds,
            approvals: [],
            permits: [],
            preSignatures: [],
          }))
        );

        Object.assign(success, mintsResult.success);
      }

      // Filter out any non-fillable orders from the path
      path = path.filter((p) => success[p.orderId]);

      if (!path.length) {
        throw getExecuteError("No fillable orders");
      }

      // Cannot skip balance checking when filling Blur orders
      if (payload.skipBalanceCheck && path.some((p) => p.source === "blur.io")) {
        payload.skipBalanceCheck = false;
      }

      // Custom gas settings
      const maxFeePerGas = payload.maxFeePerGas
        ? bn(payload.maxFeePerGas).toHexString()
        : undefined;
      const maxPriorityFeePerGas = payload.maxPriorityFeePerGas
        ? bn(payload.maxPriorityFeePerGas).toHexString()
        : undefined;

      const permitHandler = new PermitHandler(config.chainId, baseProvider);
      for (const { txData, approvals, permits, preSignatures } of txs) {
        // Handle approvals
        for (const approval of approvals) {
          const approvedAmount = await onChainData
            .fetchAndUpdateFtApproval(approval.currency, approval.owner, approval.operator)
            .then((a) => a.value);

          const isApproved = bn(approvedAmount).gte(approval.amount);
          if (!isApproved) {
            steps[1].items.push({
              status: "incomplete",
              data: {
                ...approval.txData,
                check: {
                  endpoint: "/execute/status/v1",
                  method: "POST",
                  body: {
                    kind: "transaction",
                  },
                },
                maxFeePerGas,
                maxPriorityFeePerGas,
              },
            });
          }
        }

        // Handle permits
        for (const permit of permits) {
          const id = getEphemeralPermitId(request.payload as object, {
            token: permit.data.token,
            amount: permit.data.amount,
          });

          const cachedPermit = await getEphemeralPermit(id);
          if (cachedPermit) {
            // Override with the cached permit data
            permit.data = cachedPermit.data;
          } else {
            // Cache the permit if it's the first time we encounter it
            await saveEphemeralPermit(id, permit);
          }

          // If the permit has a signature attached to it, we can skip it
          const hasSignature = permit.data.signature;
          if (hasSignature) {
            continue;
          }

          steps[2].items.push({
            status: "incomplete",
            data: {
              sign: await permitHandler.getSignatureData(permit),
              post: {
                endpoint: "/execute/permit-signature/v1",
                method: "POST",
                body: {
                  id,
                },
              },
            },
          });
        }

        // Handle pre-signatures
        const signaturesPaymentProcessor: string[] = [];
        for (const preSignature of preSignatures) {
          if (preSignature.kind === "payment-processor-take-order") {
            const id = getPreSignatureId(request.payload as object, {
              uniqueId: preSignature.uniqueId,
            });

            const cachedSignature = await getPreSignature(id);
            if (cachedSignature) {
              preSignature.signature = cachedSignature.signature;
            } else {
              await savePreSignature(id, preSignature);
            }

            const hasSignature = preSignature.signature;
            if (hasSignature) {
              signaturesPaymentProcessor.push(preSignature.signature!);
              continue;
            }

            steps[3].items.push({
              status: "incomplete",
              data: {
                sign: preSignature.data,
                post: {
                  endpoint: "/execute/pre-signature/v1",
                  method: "POST",
                  body: {
                    id,
                  },
                },
              },
            });
          }
        }
        if (signaturesPaymentProcessor.length && !steps[3].items.length) {
          const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId);
          txData.data = exchange.attachTakerSignatures(txData.data, signaturesPaymentProcessor);
        }

        // Check that the transaction sender has enough funds to fill all requested tokens
        const txSender = payload.relayer ?? payload.taker;
        if (buyInCurrency === Sdk.Common.Addresses.Native[config.chainId]) {
          // Get the price in the buy-in currency via the transaction value
          const totalBuyInCurrencyPrice = bn(txData.value ?? 0);

          const balance = await baseProvider.getBalance(txSender);
          if (!payload.skipBalanceCheck && bn(balance).lt(totalBuyInCurrencyPrice)) {
            throw getExecuteError("Balance too low to proceed with transaction");
          }
        } else {
          // Get the price in the buy-in currency via the approval amounts
          const totalBuyInCurrencyPrice = approvals
            .map((a) => bn(a.amount))
            .reduce((a, b) => a.add(b), bn(0));

          const erc20 = new Sdk.Common.Helpers.Erc20(baseProvider, buyInCurrency);
          const balance = await erc20.getBalance(txSender);
          if (!payload.skipBalanceCheck && bn(balance).lt(totalBuyInCurrencyPrice)) {
            throw getExecuteError("Balance too low to proceed with transaction");
          }
        }
      }

      // Handle on-chain authentication
      for (const tv of _.uniq(unverifiedERC721CTransferValidators)) {
        const erc721cAuthId = e.getAuthId(payload.taker);
        const erc721cAuth = await e.getAuth(erc721cAuthId);

        steps[4].items.push({
          status: "incomplete",
          // Do not return unless all previous steps are completed
          data:
            !steps[2].items.length && !steps[3].items.length
              ? new Sdk.Common.Helpers.ERC721C().generateVerificationTxData(
                  tv,
                  payload.taker,
                  erc721cAuth!.signature
                )
              : undefined,
          check: {
            endpoint: "/execute/status/v1",
            method: "POST",
            body: {
              kind: "transaction",
            },
          },
        });
      }

      for (const { txData, txTags, orderIds, permits } of txs) {
        steps[5].items.push({
          status: "incomplete",
          orderIds,
          // Do not return unless all previous steps are completed
          data:
            !steps[2].items.length && !steps[3].items.length
              ? {
                  ...permitHandler.attachToRouterExecution(txData, permits),
                  maxFeePerGas,
                  maxPriorityFeePerGas,
                }
              : undefined,
          check: {
            endpoint: "/execute/status/v1",
            method: "POST",
            body: {
              kind: "transaction",
            },
          },
          gasEstimate: txTags ? estimateGas(txTags) : undefined,
        });
      }

      // Warning! When filtering the steps, we should ensure that it
      // won't affect the client, which might be polling the API and
      // expect to get the steps returned in the same order / at the
      // same index.

      // We only filter the "currency-approval" step when there are no
      // auth transactions to be made otherwise due to how clients are
      // setup they might run into errors
      if (
        buyInCurrency === Sdk.Common.Addresses.Native[config.chainId] &&
        !unverifiedERC721CTransferValidators.length
      ) {
        // Buying in ETH will never require an approval
        steps = steps.filter((s) => s.id !== "currency-approval");
      }
      if (!payload.usePermit) {
        // Permits are only used when explicitly requested
        steps = steps.filter((s) => s.id !== "currency-permit");
      }
      if (!blurAuth && !unverifiedERC721CTransferValidators.length) {
        // If we reached this point and the Blur auth is missing then we
        // can be sure that no Blur orders were requested and it is safe
        // to remove the auth step - we also handle other authentication
        // methods (eg. ERC721C)
        steps = steps.filter((s) => s.id !== "auth");
      }
      if (!unverifiedERC721CTransferValidators.length) {
        // For now only ERC721C uses the auth transaction step
        steps = steps.filter((s) => s.id !== "auth-transaction");
      }
      if (!listingDetails.some((d) => d.kind === "payment-processor")) {
        // For now, pre-signatures are only needed for `payment-processor` orders
        steps = steps.filter((s) => s.id !== "pre-signatures");
      }

      if (steps.find((s) => s.id === "currency-permit")?.items.length) {
        // Return early since any next steps are dependent on the permits
        return {
          steps,
          path,
        };
      }

      const executionsBuffer = new ExecutionsBuffer();
      for (const item of path) {
        executionsBuffer.addFromRequest(request, {
          side: "buy",
          action: "fill",
          user: payload.taker,
          orderId: item.orderId,
          quantity: item.quantity,
          ...txs.find((tx) => tx.orderIds.includes(item.orderId))?.txData,
        });
      }
      const requestId = await executionsBuffer.flush();

      const perfTime2 = performance.now();

      logger.info(
        "execute-buy-v7-performance",
        JSON.stringify({
          kind: "total-performance",
          totalTime: (perfTime2 - perfTime1) / 1000,
          items: listingDetails.map((b) => ({ orderKind: b.kind, source: b.source })),
          itemsCount: listingDetails.length,
        })
      );

      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);
      logger.info(
        `get-execute-buy-${version}-handler`,
        JSON.stringify({
          request: payload,
          apiKey,
        })
      );

      return {
        requestId,
        steps: blurAuth ? [steps[0], ...steps.slice(1).filter((s) => s.items.length)] : steps,
        errors,
        path,
      };
    } catch (error) {
      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);
      logger.error(
        `get-execute-buy-${version}-handler`,
        JSON.stringify({
          request: payload,
          uuid: randomUUID(),
          timestampAccurate: Date.now(),
          httpCode: error instanceof Boom.Boom ? error.output.statusCode : 500,
          error:
            error instanceof Boom.Boom ? error.output.payload : { error: "Internal Server Error" },
          apiKey,
        })
      );

      throw error;
    }
  },
};
