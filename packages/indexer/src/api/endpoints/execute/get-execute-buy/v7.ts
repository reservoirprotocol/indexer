import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import { FillListingsResult, ListingDetails } from "@reservoir0x/sdk/dist/router/v6/types";
import axios from "axios";
import _ from "lodash";
import Joi from "joi";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiExecuteFee, JoiOrderDepth } from "@/common/joi";
import { baseProvider } from "@/common/provider";
import { bn, formatEth, formatPrice, fromBuffer, now, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";
import { Sources } from "@/models/sources";
import { OrderKind, generateListingDetailsV6 } from "@/orderbook/orders";
import { fillErrorCallback, getExecuteError } from "@/orderbook/orders/errors";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as nftx from "@/orderbook/orders/nftx";
import * as sudoswap from "@/orderbook/orders/sudoswap";
import * as b from "@/utils/auth/blur";
import { getCurrency } from "@/utils/currencies";
import { ExecutionsBuffer } from "@/utils/executions";
import * as onChainData from "@/utils/on-chain-data";
import * as mints from "@/utils/mints/collection-mints";
import { generateMintTxData } from "@/utils/mints/calldata/generator";
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
                  "blur-partial",
                  "looks-rare",
                  "zeroex-v4",
                  "seaport",
                  "seaport-v1.4",
                  "seaport-v1.5",
                  "x2y2",
                  "universe",
                  "rarible",
                  "sudoswap",
                  "flow",
                  "nftx",
                  "alienswap"
                )
                .required(),
              data: Joi.object().required(),
            }).description("Optional raw order to fill."),
            fillType: Joi.string()
              .valid("trade", "mint")
              .description(
                "Optionally specify a particular fill method (by default both trades and mints will be included). Only relevant when filling via `collection`."
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
        .description("Address of wallet filling."),
      relayer: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Address of wallet relaying the fill transaction."),
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the path will be returned."),
      preview: Joi.string()
        .valid("depth")
        .description("When set, returns a preview of the fill (without actually filling)."),
      forceRouter: Joi.boolean().description(
        "If true, all fills will be executed through the router (where possible)"
      ),
      currency: Joi.string().description("Currency to be used for purchases."),
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
          quantity: Joi.number().unsafe().description("Can be higher than 1 if erc1155"),
          source: Joi.string().allow("", null),
          currency: Joi.string().lowercase().pattern(regex.address),
          currencySymbol: Joi.string().optional(),
          currencyDecimals: Joi.number().optional(),
          quote: Joi.number().unsafe(),
          rawQuote: Joi.string().pattern(regex.number),
          buyInQuote: Joi.number().unsafe(),
          buyInRawQuote: Joi.string().pattern(regex.number),
          totalPrice: Joi.number().unsafe(),
          totalRawPrice: Joi.string().pattern(regex.number),
          builtInFees: Joi.array()
            .items(JoiExecuteFee)
            .description("Can be marketplace fees or royalties"),
          feesOnTop: Joi.array().items(JoiExecuteFee).description("Can be referral fees."),
        })
      ),
      preview: Joi.array().items(
        Joi.object({
          itemIndex: Joi.number().required(),
          depth: JoiOrderDepth,
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
        bps: number;
        amount: number;
        rawAmount: string;
      };

      // Keep track of the listings and path to fill
      const listingDetails: ListingDetails[] = [];
      let path: {
        orderId: string;
        contract: string;
        tokenId: string;
        quantity: number;
        source: string | null;
        currency: string;
        currencySymbol?: string;
        currencyDecimals?: number;
        // Gross price (without fees on top) = price
        quote: number;
        rawQuote: string;
        buyInQuote?: number;
        buyInRawQuote?: string;
        // Total price (with fees on top) = price + feesOnTop
        totalPrice?: number;
        totalRawPrice?: string;
        builtInFees: ExecuteFee[];
        feesOnTop: ExecuteFee[];
      }[] = [];
      const depthPreview: {
        [itemIndex: number]: {
          price: number;
          quantity: number;
        }[];
      } = {};

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
          tokenId: string;
          quantity?: number;
        },
        itemIndex: number
      ) => {
        // Handle dynamically-priced orders
        if (["sudoswap", "sudoswap-v2", "collectionxyz", "nftx"].includes(order.kind)) {
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

        if (order.kind !== "mint") {
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

        const precisionDecimals = 4;
        const scale = (value: number) => Number(value.toFixed(precisionDecimals));

        if (!depthPreview[itemIndex]) {
          depthPreview[itemIndex] = [];
        }
        depthPreview[itemIndex].push({
          price: scale(formatEth(order.nativePrice)),
          quantity,
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
                tokenId: token.tokenId,
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
        fillType?: "trade" | "mint";
        originalItemIndex?: number;
      }[] = payload.items;

      // Keep track of any mint transactions that need to be aggregated
      const mintTxs: {
        orderId: string;
        txData: TxData;
      }[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemIndex =
          items[i].originalItemIndex !== undefined ? items[i].originalItemIndex! : i;

        // When requesting the preview, force partial filling and a high enough
        // quantity for each token in order to cover most practical use-cases
        if (payload.preview === "depth") {
          payload.partial = true;
          item.quantity = 50;
        }

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
                currency: Sdk.Common.Addresses.Eth[config.chainId],
                rawData: order.data,
                builtInFees: [],
              },
              {
                kind: "erc721",
                contract: order.data.contract,
                tokenId: order.data.tokenId,
              },
              itemIndex
            );
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
              if (payload.partial) {
                continue;
              } else {
                throw getExecuteError("Raw order failed to get processed");
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
            if (payload.partial) {
              continue;
            } else {
              throw getExecuteError(error);
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
            },
            itemIndex
          );
        }

        // Scenario 3: fill via `collection`
        if (item.collection) {
          if (!item.fillType || item.fillType === "mint") {
            // Fetch any open mints on the collection which the taker is elligible for
            const openMints = await mints.getOpenCollectionMints(item.collection);
            for (const mint of openMints) {
              if (!payload.currency || mint.currency === payload.currency) {
                const collectionData = await idb.one(
                  `
                    SELECT
                      collections.contract,
                      contracts.kind AS token_kind,
                      (
                        SELECT
                          MAX(tokens.token_id) + 1
                        FROM tokens
                        WHERE tokens.contract = collections.contract
                          AND tokens.collection_id = collections.id
                      ) AS next_token_id
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
                  const quantityToMint = mint.maxMintsPerWallet
                    ? Math.min(item.quantity, Number(mint.maxMintsPerWallet))
                    : item.quantity;

                  const orderId = `mint:${item.collection}`;
                  mintTxs.push({
                    orderId,
                    txData: generateMintTxData(
                      mint.details,
                      payload.taker,
                      fromBuffer(collectionData.contract),
                      quantityToMint,
                      mint.price
                    ),
                  });

                  await addToPath(
                    {
                      id: orderId,
                      kind: "mint",
                      maker: fromBuffer(collectionData.contract),
                      nativePrice: mint.price,
                      price: mint.price,
                      sourceId: null,
                      currency: mint.currency,
                      rawData: {},
                      builtInFees: [],
                      additionalFees: [],
                    },
                    {
                      kind: collectionData.token_kind,
                      contract: fromBuffer(collectionData.contract),
                      tokenId: collectionData.next_token_id,
                      quantity: quantityToMint,
                    },
                    itemIndex
                  );

                  item.quantity -= quantityToMint;
                }
              }
            }
          }

          if (item.quantity > 0 && (!item.fillType || item.fillType === "trade")) {
            // Filtering by collection on the `orders` table is inefficient, so what we
            // do here is select the cheapest tokens from the `tokens` table and filter
            // out the ones that aren't fillable. For this to work we fetch more tokens
            // than we need, so we can filter out the ones that aren't fillable and not
            // end up with too few tokens.

            const redundancyFactor = 5;
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
                LIMIT $/quantity/
              `,
              {
                collection: item.collection,
                quantity: item.quantity,
              }
            );

            // Add each retrieved token as a new item so that it will get
            // processed by the next pipeline of the same API rather than
            // building something custom for it.

            for (const t of tokenResults) {
              items.push({
                token: `${fromBuffer(t.contract)}:${t.token_id}`,
                quantity: 1,
                originalItemIndex: itemIndex,
              });
            }
          }
        }

        // Scenario 4: fill via `token`
        if (item.token) {
          const [contract, tokenId] = item.token.split(":");

          // TODO: Right now we filter out Blur orders since those don't yet
          // support royalty normalization. A better approach to handling it
          // would be to set the normalized fields to `null` for every order
          // which doesn't support royalty normalization and then filter out
          // such `null` fields in various normalized events/caches.

          // Only one of `exactOrderSource` and `preferredOrderSource` will be set
          const sourceDomain = item.exactOrderSource || item.preferredOrderSource;

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
                ${item.exclusions?.length ? " AND orders.id NOT IN ($/excludedOrderIds:list/)" : ""}
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
                quantity: Math.min(quantityToFill, availableQuantity),
              },
              itemIndex
            );

            // Update the quantity to fill with the current order's available quantity
            quantityToFill -= availableQuantity;
          }

          if (quantityToFill > 0) {
            if (payload.partial) {
              continue;
            } else {
              if (makerEqualsTakerQuantity >= quantityToFill) {
                throw getExecuteError("No fillable orders (taker cannot fill own orders)");
              } else {
                throw getExecuteError("Unable to fill requested quantity");
              }
            }
          }
        }
      }

      if (payload.preview === "depth") {
        return {
          preview: Object.entries(depthPreview).map(([itemIndex, depth]) => ({
            itemIndex: Number(itemIndex),
            depth: _.orderBy(
              [
                ..._.reduce(
                  depth,
                  (aggregate, value) => {
                    const currentQuantity = aggregate.get(value.price);
                    if (currentQuantity) {
                      aggregate.set(value.price, currentQuantity + value.quantity);
                    } else {
                      aggregate.set(value.price, value.quantity);
                    }
                    return aggregate;
                  },
                  new Map<number, number>()
                ).entries(),
              ].map(([price, quantity]) => ({ price, quantity })),
              ["price"],
              ["asc"]
            ),
          })),
        };
      }

      if (!path.length) {
        throw getExecuteError("No fillable orders");
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
            item.buyInQuote = formatPrice(
              buyInPrices.currencyPrice,
              (await getCurrency(buyInCurrency)).decimals,
              true
            );
            item.buyInRawQuote = buyInPrices.currencyPrice;
          }
        }
      }

      // Include the global fees in the path

      const globalFees = (payload.feesOnTop ?? []).map((fee: string) => {
        const [recipient, amount] = fee.split(":");
        return { recipient, amount };
      });

      const hasBlurListings = listingDetails.some((b) => b.source === "blur.io");
      const ordersEligibleForGlobalFees = listingDetails
        .filter(
          (b) =>
            b.source !== "blur.io" &&
            (hasBlurListings
              ? !["opensea.io", "looksrare.org", "x2y2.io"].includes(b.source!)
              : true)
        )
        .map((b) => b.orderId);

      const addGlobalFee = async (item: (typeof path)[0], fee: Sdk.RouterV6.Types.Fee) => {
        // Global fees get split across all eligible orders
        const adjustedFeeAmount = bn(fee.amount).div(ordersEligibleForGlobalFees.length).toString();

        const itemNetPrice = bn(item.rawQuote).sub(
          item.feesOnTop.map((f) => bn(f.rawAmount)).reduce((a, b) => a.add(b), bn(0))
        );

        const amount = formatPrice(
          adjustedFeeAmount,
          (await getCurrency(item.currency)).decimals,
          true
        );
        const rawAmount = bn(adjustedFeeAmount).toString();

        item.feesOnTop.push({
          recipient: fee.recipient,
          bps: bn(itemNetPrice).mul(10000).div(item.rawQuote).toNumber(),
          amount,
          rawAmount,
        });

        item.totalPrice = (item.totalPrice ?? item.quote) + amount;
        item.totalRawPrice = bn(item.totalRawPrice ?? item.rawQuote)
          .add(rawAmount)
          .toString();

        // item.quote += amount;
        // item.rawQuote = bn(item.rawQuote).add(rawAmount).toString();
      };

      for (const item of path) {
        if (globalFees.length && ordersEligibleForGlobalFees.includes(item.orderId)) {
          for (const f of globalFees) {
            await addGlobalFee(item, f);
          }
        } else {
          item.totalPrice = item.quote;
          item.totalRawPrice = item.rawQuote;
        }
      }

      if (payload.onlyPath) {
        return { path };
      }

      // Set up generic filling steps
      let steps: {
        id: string;
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          tip?: string;
          orderIds?: string[];
          data?: object;
        }[];
      }[] = [
        {
          id: "auth",
          action: "Sign in to Blur",
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
          id: "sale",
          action: "Confirm transaction in your wallet",
          description: "To purchase this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
          items: [],
        },
      ];

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

            // Return an early since any next steps are dependent on the Blur auth
            return {
              steps,
              path,
            };
          }
        }

        steps[0].items.push({
          status: "complete",
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
          globalFees,
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
      for (const { orderId, txData } of mintTxs) {
        txs.push({
          approvals: [],
          txData,
          orderIds: [orderId],
        });
        success[orderId] = true;
      }

      // Filter out any non-fillable orders from the path
      path = path.filter((p) => success[p.orderId]);

      if (!path.length) {
        throw getExecuteError("No fillable orders");
      }

      // Custom gas settings
      const maxFeePerGas = payload.maxFeePerGas
        ? bn(payload.maxFeePerGas).toHexString()
        : undefined;
      const maxPriorityFeePerGas = payload.maxPriorityFeePerGas
        ? bn(payload.maxPriorityFeePerGas).toHexString()
        : undefined;

      for (const { txData, approvals, orderIds } of txs) {
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
                maxFeePerGas,
                maxPriorityFeePerGas,
              },
            });
          }
        }

        // Cannot skip balance checking when filling Blur orders
        if (payload.skipBalanceCheck && path.some((p) => p.source === "blur.io")) {
          payload.skipBalanceCheck = false;
        }

        // Check that the transaction sender has enough funds to fill all requested tokens
        const txSender = payload.relayer ?? payload.taker;
        if (buyInCurrency === Sdk.Common.Addresses.Eth[config.chainId]) {
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

        steps[2].items.push({
          status: "incomplete",
          orderIds,
          data: {
            ...txData,
            maxFeePerGas,
            maxPriorityFeePerGas,
          },
        });
      }

      // Warning! When filtering the steps, we should ensure that it
      // won't affect the client, which might be polling the API and
      // expect to get the steps returned in the same order / at the
      // same index.
      if (buyInCurrency === Sdk.Common.Addresses.Eth[config.chainId]) {
        // Buying in ETH will never require an approval
        steps = [steps[0], ...steps.slice(2)];
      }
      if (!blurAuth) {
        // If we reached this point and the Blur auth is missing then we
        // can be sure that no Blur orders were requested and it is safe
        // to remove the auth step
        steps = steps.slice(1);
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

      return {
        requestId,
        steps: blurAuth ? [steps[0], ...steps.slice(1).filter((s) => s.items.length)] : steps,
        errors,
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
