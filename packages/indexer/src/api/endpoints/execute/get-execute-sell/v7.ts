import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/solidity";
import { parseEther } from "@ethersproject/units";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { BidDetails, FillBidsResult } from "@reservoir0x/sdk/dist/router/v6/types";
import { estimateGasFromTxTags } from "@reservoir0x/sdk/dist/router/v6/utils";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import axios from "axios";
import { randomUUID } from "crypto";
import Joi from "joi";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiExecuteFee } from "@/common/joi";
import { baseProvider } from "@/common/provider";
import { bn, formatPrice, fromBuffer, now, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { ApiKeyManager } from "@/models/api-keys";
import { FeeRecipients } from "@/models/fee-recipients";
import { Sources } from "@/models/sources";
import { OrderKind, generateBidDetailsV6 } from "@/orderbook/orders";
import { fillErrorCallback, getExecuteError } from "@/orderbook/orders/errors";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as nftx from "@/orderbook/orders/nftx";
import * as sudoswap from "@/orderbook/orders/sudoswap";
import * as b from "@/utils/auth/blur";
import { getCurrency } from "@/utils/currencies";
import { ExecutionsBuffer } from "@/utils/executions";
import * as onChainData from "@/utils/on-chain-data";
import { getPersistentPermit } from "@/utils/permits";
import { getPreSignatureId, getPreSignature, savePreSignature } from "@/utils/pre-signatures";
import { getUSDAndCurrencyPrices } from "@/utils/prices";

const version = "v7";

export const getExecuteSellV7Options: RouteOptions = {
  description: "Sell Tokens",
  notes:
    "Use this API to accept bids. We recommend using the SDK over this API as the SDK will iterate through the steps and return callbacks. Please mark `excludeEOA` as `true` to exclude Blur orders.",
  tags: ["api"],
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
            token: Joi.string()
              .lowercase()
              .pattern(regex.token)
              .required()
              .description("Token to sell."),
            quantity: Joi.number()
              .integer()
              .positive()
              .default(1)
              .description("Quantity of tokens to sell."),
            orderId: Joi.string().lowercase().description("Optional order id to sell into."),
            rawOrder: Joi.object({
              kind: Joi.string()
                .lowercase()
                .valid(
                  "blur-partial",
                  "opensea",
                  "looks-rare",
                  "zeroex-v4",
                  "seaport",
                  "seaport-v1.4",
                  "seaport-v1.5",
                  "x2y2",
                  "rarible",
                  "sudoswap",
                  "nftx"
                ),
              data: Joi.object(),
            }).description("Optional raw order to sell into."),
            exactOrderSource: Joi.string()
              .lowercase()
              .pattern(regex.domain)
              .when("orderId", { is: Joi.exist(), then: Joi.forbidden(), otherwise: Joi.allow() })
              .when("rawOrder", { is: Joi.exist(), then: Joi.forbidden(), otherwise: Joi.allow() })
              .description("Only consider orders from this source."),
            exclusions: Joi.array()
              .items(
                Joi.object({
                  orderId: Joi.string().required(),
                  price: Joi.string().pattern(regex.number),
                })
              )
              .description("Items to exclude"),
          }).oxor("orderId", "rawOrder")
        )
        .min(1)
        .required()
        .description("List of items to sell."),
      taker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description("Address of wallet filling."),
      source: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .description("Filling source used for attribution."),
      feesOnTop: Joi.array()
        .items(Joi.string().pattern(regex.fee))
        .description(
          "List of fees (formatted as `feeRecipient:feeAmount`) to be taken when filling.\nThe currency used for any fees on top is always the wrapped native currency of the chain.\nExample: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00:1000000000000000`"
        ),
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the filling path will be returned."),
      normalizeRoyalties: Joi.boolean().default(false).description("Charge any missing royalties."),
      excludeEOA: Joi.boolean()
        .default(false)
        .description(
          "Exclude orders that can only be filled by EOAs, to support filling with smart contracts."
        ),
      allowInactiveOrderIds: Joi.boolean()
        .default(false)
        .description(
          "If true, inactive orders will not be skipped over (only relevant when filling via a specific order id)."
        ),
      partial: Joi.boolean()
        .default(false)
        .description("If true, any off-chain or on-chain errors will be skipped."),
      forceRouter: Joi.boolean()
        .default(false)
        .description(
          "If true, filling will be forced to use the common 'approval + transfer' method instead of the approval-less 'on-received hook' method"
        ),
      forwarderChannel: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "If passed, all fills will be executed through the trusted trusted forwarder (where possible)"
        )
        .optional(),
      currency: Joi.string().lowercase().description("Currency to be received when selling."),
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
      blurAuth: Joi.string().description("Optional Blur auth used for filling"),
    }),
  },
  response: {
    schema: Joi.object({
      requestId: Joi.string(),
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required().description("Returns `auth` or `nft-approval`"),
          action: Joi.string().required(),
          description: Joi.string().required(),
          kind: Joi.string()
            .valid("signature", "transaction")
            .required()
            .description("Returns `signature` or `transaction`."),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string()
                  .valid("complete", "incomplete")
                  .required()
                  .description("Returns `complete` or `incomplete`."),
                tip: Joi.string(),
                orderIds: Joi.array().items(Joi.string()),
                data: Joi.object(),
                gasEstimate: Joi.number().description(
                  "Approximation of gas used (only applies to `transaction` items)"
                ),
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
          // Net price (without fees on top) = price - builtInFees
          quote: Joi.number().unsafe(),
          rawQuote: Joi.string().pattern(regex.number),
          sellOutCurrency: Joi.string().lowercase().pattern(regex.address),
          sellOutCurrencySymbol: Joi.string().optional().allow(null),
          sellOutCurrencyDecimals: Joi.number().optional().allow(null),
          sellOutQuote: Joi.number().unsafe(),
          sellOutRawQuote: Joi.string().pattern(regex.number),
          // Total price (with fees on top) = price + feesOnTop
          totalPrice: Joi.number().unsafe(),
          totalRawPrice: Joi.string().pattern(regex.number),
          builtInFees: Joi.array()
            .items(JoiExecuteFee)
            .description("Can be marketplace fees or royalties"),
          feesOnTop: Joi.array().items(JoiExecuteFee).description("Can be referral fees."),
        })
      ),
    }).label(`getExecuteSell${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-sell-${version}-handler`, `Wrong response schema: ${error}`);
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

      // Keep track of the bids and path to fill
      const bidDetails: BidDetails[] = [];
      let path: {
        orderId: string;
        contract: string;
        tokenId: string;
        quantity: number;
        source: string | null;
        currency: string;
        currencySymbol?: string;
        currencyDecimals?: number;
        quote: number;
        rawQuote: string;
        sellOutCurrency?: string;
        sellOutCurrencySymbol?: string;
        sellOutCurrencyDecimals?: number;
        sellOutQuote?: number;
        sellOutRawQuote?: string;
        totalPrice: number;
        totalRawPrice: string;
        builtInFees: ExecuteFee[];
        feesOnTop: ExecuteFee[];
      }[] = [];

      // Keep track of dynamically-priced orders (eg. from pools like Sudoswap and NFTX)
      const poolPrices: { [pool: string]: string[] } = {};
      // Keep track of the remaining quantities as orders are filled
      const quantityFilled: { [orderId: string]: number } = {};
      // Keep track of the maker balances as orders are filled
      const getMakerBalancesKey = (maker: string, currency: string) => `${maker}-${currency}`;
      const makerBalances: { [makerAndCurrency: string]: BigNumber } = {};
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
          price: string;
          sourceId: number | null;
          currency: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rawData: any;
          builtInFees: { kind: string; recipient: string; bps: number }[];
          additionalFees?: Sdk.RouterV6.Types.Fee[];
        },
        token: {
          kind: "erc721" | "erc1155";
          contract: string;
          tokenId: string;
          quantity?: number;
          owner?: string;
        }
      ) => {
        // Handle dynamically-priced orders
        if (
          ["blur", "sudoswap", "sudoswap-v2", "nftx", "nftx-v3", "caviar-v1"].includes(order.kind)
        ) {
          // TODO: Handle the case when the next best-priced order in the database
          // has a better price than the current dynamically-priced order (because
          // of a quantity > 1 being filled on this current order).

          let poolId: string;
          let priceList: string[];

          if (order.kind === "blur") {
            const rawData = order.rawData as Sdk.Blur.Types.BlurBidPool;
            poolId = rawData.collection;
            priceList = rawData.pricePoints
              .map((pp) =>
                Array.from({ length: pp.executableSize }, () => parseEther(pp.price).toString())
              )
              .flat();
          } else if (["sudoswap", "sudoswap-v2"].includes(order.kind)) {
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

        // Decrement the maker's available FT balance
        const quantityAdjustedPrice = bn(order.price).mul(quantity);
        const key = getMakerBalancesKey(order.maker, order.currency);
        if (!makerBalances[key]) {
          makerBalances[key] = await commonHelpers.getFtBalance(order.currency, order.maker);
        }
        makerBalances[key] = makerBalances[key].sub(quantityAdjustedPrice);

        const unitPrice = bn(order.price);
        const source = order.sourceId !== null ? sources.get(order.sourceId)?.domain ?? null : null;
        const additionalFees = payload.normalizeRoyalties ? order.additionalFees ?? [] : [];
        const builtInFees = order.builtInFees ?? [];

        // Sum the built-in fees and any additional fees
        const totalFee = bn(
          builtInFees
            .map(({ bps }) => unitPrice.mul(bps).div(10000))
            .reduce((a, b) => a.add(b), bn(0))
        ).add(additionalFees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0)));

        const netPrice = unitPrice.sub(totalFee);
        const currency = await getCurrency(order.currency);
        path.push({
          orderId: order.id,
          contract: token.contract,
          tokenId: token.tokenId,
          quantity,
          source,
          currency: order.currency,
          currencySymbol: currency.symbol,
          currencyDecimals: currency.decimals,
          quote: formatPrice(netPrice, currency.decimals, true),
          rawQuote: netPrice.toString(),
          totalPrice: formatPrice(unitPrice, currency.decimals, true),
          totalRawPrice: unitPrice.toString(),
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
            ...additionalFees.map((f) => ({
              kind: "marketplace",
              recipient: f.recipient,
              bps: bn(f.amount).mul(10000).div(unitPrice).toNumber(),
              amount: formatPrice(f.amount, currency.decimals, true),
              rawAmount: bn(f.amount).toString(),
            })),
          ],
        });

        // Load any permits
        const permit = order.rawData.permitId
          ? await getPersistentPermit(order.rawData.permitId, order.rawData.permitIndex ?? 0)
          : undefined;

        bidDetails.push(
          await generateBidDetailsV6(
            {
              id: order.id,
              kind: order.kind,
              unitPrice: order.price,
              rawData: order.rawData,
              currency: order.currency,
              source: source || undefined,
              fees: additionalFees,
              builtInFeeBps: builtInFees.map(({ bps }) => bps).reduce((a, b) => a + b, 0),
              isProtected:
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (order.rawData as any).zone ===
                Sdk.SeaportBase.Addresses.OpenSeaProtectedOffersZone[config.chainId],
            },
            {
              kind: token.kind,
              contract: token.contract,
              tokenId: token.tokenId,
              amount: token.quantity,
              owner: token.owner,
            },
            payload.taker,
            {
              permit,
              ppV2TrustedChannel: payload.forwarderChannel,
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
        exactOrderSource?: string;
        exclusions?: {
          orderId: string;
        }[];
      }[] = payload.items;

      for (const item of items) {
        const [contract, tokenId] = item.token.split(":");

        const tokenResult = await idb.oneOrNone(
          `
            SELECT
              tokens.is_flagged,
              coalesce(extract('epoch' from tokens.last_flag_update), 0) AS last_flag_update
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
          if (payload.partial) {
            continue;
          } else {
            throw getExecuteError("Unknown token");
          }
        }

        // Scenario 1: fill via `rawOrder`
        if (item.rawOrder) {
          const order = item.rawOrder;

          // Hack: As the raw order is processed, set it to the `orderId`
          // field so that it will get handled by the next pipeline step
          // of this same API rather than doing anything custom for it.

          // TODO: Handle any other on-chain orderbooks that cannot be "posted"
          if (order.kind === "sudoswap") {
            item.orderId = sudoswap.getOrderId(order.data.pair, "buy");
          } else if (order.kind === "nftx") {
            item.orderId = nftx.getOrderId(order.data.pool, "buy");
          } else if (order.kind === "blur-partial") {
            await addToPath(
              {
                id: keccak256(["string", "address"], ["blur", order.data.contract]),
                kind: "blur",
                maker: AddressZero,
                price: order.data.price,
                sourceId: sources.getByDomain("blur.io")?.id ?? null,
                currency: Sdk.Blur.Addresses.Beth[config.chainId],
                rawData: order.data,
                builtInFees: [],
              },
              {
                kind: "erc721",
                contract: order.data.contract,
                tokenId,
              }
            );
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
                coalesce(orders.currency_price, orders.price) AS price,
                orders.raw_data,
                orders.source_id_int,
                orders.currency,
                orders.missing_royalties,
                orders.maker,
                orders.token_set_id,
                orders.fee_breakdown,
                orders.maker,
                orders.fillability_status,
                orders.approval_status,
                orders.quantity_remaining
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE orders.id = $/id/
                AND token_sets_tokens.contract = $/contract/
                AND token_sets_tokens.token_id = $/tokenId/
                AND orders.side = 'buy'
                AND (
                  orders.taker IS NULL
                  OR orders.taker = '\\x0000000000000000000000000000000000000000'
                  OR orders.taker = $/taker/
                )
                ${item.exclusions?.length ? " AND orders.id NOT IN ($/excludedOrderIds:list/)" : ""}
            `,
            {
              id: item.orderId,
              contract: toBuffer(contract),
              tokenId,
              taker: toBuffer(payload.taker),
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

          // Partial Seaport orders require knowing the owner
          let owner: string | undefined;
          if (["seaport-v1.4-partial", "seaport-v1.5-partial"].includes(result.kind)) {
            const ownerResult = await idb.oneOrNone(
              `
                SELECT
                  nft_balances.owner
                FROM nft_balances
                WHERE nft_balances.contract = $/contract/
                  AND nft_balances.token_id = $/tokenId/
                  AND nft_balances.amount >= $/quantity/
                LIMIT 1
              `,
              {
                contract: toBuffer(contract),
                tokenId,
                quantity: item.quantity,
              }
            );
            if (ownerResult) {
              owner = fromBuffer(ownerResult.owner);
            }
          }

          // Do not fill Seaport orders with flagged tokens
          if (
            [
              "seaport-v1.4",
              "seaport-v1.5",
              "seaport-v1.4-partial",
              "seaport-v1.5-partial",
            ].includes(result.kind)
          ) {
            if (tokenResult.is_flagged) {
              if (payload.partial) {
                continue;
              } else {
                throw getExecuteError("Token is flagged");
              }
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
              builtInFees: result.fee_breakdown,
              additionalFees: result.missing_royalties,
            },
            {
              kind: result.token_kind,
              contract,
              tokenId,
              quantity: item.quantity,
              owner,
            }
          );
        }

        // Scenario 3: fill via `token`
        if (!item.rawOrder && !item.orderId) {
          // Fetch all matching orders sorted by price
          const orderResults = await idb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                contracts.kind AS token_kind,
                coalesce(orders.currency_price, orders.price) AS price,
                orders.raw_data,
                orders.source_id_int,
                orders.currency,
                orders.missing_royalties,
                orders.maker,
                orders.quantity_remaining,
                orders.fee_breakdown
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE token_sets_tokens.contract = $/contract/
                AND token_sets_tokens.token_id = $/tokenId/
                AND orders.side = 'buy'
                AND orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'
                AND (
                  orders.taker IS NULL
                  OR orders.taker = '\\x0000000000000000000000000000000000000000'
                  OR orders.taker = $/taker/
                )
                ${payload.normalizeRoyalties ? " AND orders.normalized_value IS NOT NULL" : ""}
                ${payload.excludeEOA ? " AND orders.kind != 'blur'" : ""}
                ${item.exactOrderSource ? " AND orders.source_id_int = $/sourceId/" : ""}
                ${item.exclusions?.length ? " AND orders.id NOT IN ($/excludedOrderIds:list/)" : ""}
              ORDER BY ${
                payload.normalizeRoyalties ? "orders.normalized_value" : "orders.value"
              } DESC
            `,
            {
              id: item.orderId,
              contract: toBuffer(contract),
              tokenId,
              quantity: item.quantity,
              sourceId: item.exactOrderSource
                ? sources.getByDomain(item.exactOrderSource)?.id ?? -1
                : undefined,
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

            // Partial Seaport orders require knowing the owner
            let owner: string | undefined;
            if (["seaport-v1.4-partial", "seaport-v1.5-partial"].includes(result.kind)) {
              const ownerResult = await idb.oneOrNone(
                `
                  SELECT
                    nft_balances.owner
                  FROM nft_balances
                  WHERE nft_balances.contract = $/contract/
                    AND nft_balances.token_id = $/tokenId/
                    AND nft_balances.amount >= $/quantity/
                  LIMIT 1
                `,
                {
                  contract: toBuffer(contract),
                  tokenId,
                  quantity: item.quantity,
                }
              );
              if (ownerResult) {
                owner = fromBuffer(ownerResult.owner);
              }
            }

            // Do not fill Seaport orders with flagged tokens
            if (
              [
                "seaport-v1.4",
                "seaport-v1.5",
                "seaport-v1.4-partial",
                "seaport-v1.5-partial",
              ].includes(result.kind)
            ) {
              if (tokenResult.is_flagged) {
                if (payload.partial) {
                  continue;
                }
              }
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

            const maker = fromBuffer(result.maker);
            const currency = fromBuffer(result.currency);

            // Account for the already filled maker's balance (not needed for Blur orders)
            if (result.kind !== "blur") {
              const key = getMakerBalancesKey(maker, currency);
              if (makerBalances[key]) {
                const makerAvailableQuantity = makerBalances[key].div(result.price).toNumber();
                if (makerAvailableQuantity < availableQuantity) {
                  availableQuantity = makerAvailableQuantity;
                }
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
                price: result.price,
                sourceId: result.source_id_int,
                currency,
                rawData: result.raw_data,
                builtInFees: result.fee_breakdown,
                additionalFees: result.missing_royalties,
              },
              {
                kind: result.token_kind,
                contract,
                tokenId,
                quantity: Math.min(quantityToFill, availableQuantity),
                owner,
              }
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

      if (!path.length) {
        throw getExecuteError("No fillable orders");
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

      const ordersEligibleForGlobalFees = bidDetails
        .filter((b) => b.source !== "blur.io")
        .map((b) => b.orderId);

      const addGlobalFee = async (
        detail: BidDetails,
        item: (typeof path)[0],
        fee: Sdk.RouterV6.Types.Fee
      ) => {
        // The fees should be relative to a single quantity
        let feeAmount = bn(fee.amount).div(item.quantity).toString();

        // Global fees get split across all eligible orders
        let adjustedFeeAmount = bn(feeAmount).div(ordersEligibleForGlobalFees.length).toString();

        // If the item's currency is not the same with the sell-in currency
        if (item.currency !== Sdk.Common.Addresses.WNative[config.chainId]) {
          feeAmount = await getUSDAndCurrencyPrices(
            Sdk.Common.Addresses.WNative[config.chainId],
            item.currency,
            feeAmount,
            now()
          ).then((p) => p.currencyPrice!);
          adjustedFeeAmount = await getUSDAndCurrencyPrices(
            Sdk.Common.Addresses.WNative[config.chainId],
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

        // item.quote -= amount;
        // item.rawQuote = bn(item.rawQuote).sub(rawAmount).toString();

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
            const detail = bidDetails.find((d) => d.orderId === item.orderId);
            if (detail) {
              await addGlobalFee(detail, item, f);
            }
          }
        }
      }

      const sellOutCurrency = payload.currency;

      // Add the quotes in the "sell-out" currency to the path items
      for (const item of path) {
        if (sellOutCurrency && item.currency !== sellOutCurrency) {
          const sellOutPrices = await getUSDAndCurrencyPrices(
            item.currency,
            sellOutCurrency,
            item.rawQuote,
            now(),
            {
              acceptStalePrice: true,
            }
          );

          if (sellOutPrices.currencyPrice) {
            const c = await getCurrency(sellOutCurrency);
            item.sellOutCurrency = c.contract;
            item.sellOutCurrencyDecimals = c.decimals;
            item.sellOutCurrencySymbol = c.symbol;
            item.sellOutQuote = formatPrice(sellOutPrices.currencyPrice, c.decimals, true);
            item.sellOutRawQuote = sellOutPrices.currencyPrice;
          }
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
          orderIds?: string[];
          tip?: string;
          data?: object;
          gasEstimate?: number;
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
          id: "nft-approval",
          action: "Approve NFT contract",
          description:
            "Each NFT collection you want to trade requires a one-time approval transaction",
          kind: "transaction",
          items: [],
        },
        {
          id: "currency-approval",
          action: "Approve currency",
          description: "Each currency you want to swap requires a one-time approval transaction",
          kind: "transaction",
          items: [],
        },
        {
          id: "pre-signatures",
          action: "Sign data",
          description: "Some exchanges require signing additional data before filling",
          kind: "signature",
          items: [],
        },
        {
          id: "currency-permit",
          action: "Permit currency",
          description: "Some orders need a permit to be relayed on-chain before filling",
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

      // Custom gas settings
      const maxFeePerGas = payload.maxFeePerGas
        ? bn(payload.maxFeePerGas).toHexString()
        : undefined;
      const maxPriorityFeePerGas = payload.maxPriorityFeePerGas
        ? bn(payload.maxPriorityFeePerGas).toHexString()
        : undefined;

      // Handle Blur authentication
      let blurAuth: b.Auth | undefined;
      if (path.some((p) => p.source === "blur.io")) {
        const missingApprovals: { txData: TxData; orderIds: string[] }[] = [];

        const contractsAndOrderIds: { [contract: string]: string[] } = {};
        for (const p of path.filter((p) => p.source === "blur.io")) {
          if (!contractsAndOrderIds[p.contract]) {
            contractsAndOrderIds[p.contract] = [];
          }
          contractsAndOrderIds[p.contract].push(p.orderId);
        }

        for (const [contract, orderIds] of Object.entries(contractsAndOrderIds)) {
          const operator = Sdk.BlurV2.Addresses.Delegate[config.chainId];
          const isApproved = await commonHelpers.getNftApproval(contract, payload.taker, operator);
          if (!isApproved) {
            missingApprovals.push({
              txData: {
                maxFeePerGas,
                maxPriorityFeePerGas,
                ...new Sdk.Common.Helpers.Erc721(baseProvider, contract).approveTransaction(
                  payload.taker,
                  operator
                ),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any,
              orderIds,
            });
          }
        }

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

            // Remove any 'pre-signature' steps
            if (bidDetails.every((d) => d.kind !== "payment-processor")) {
              steps = steps.filter((s) => s.id !== "pre-signatures");
            }

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

        if (missingApprovals.length) {
          for (const { txData, orderIds } of missingApprovals) {
            steps[1].items.push({
              status: "incomplete",
              orderIds,
              data: {
                ...txData,
                maxFeePerGas,
                maxPriorityFeePerGas,
              },
            });
          }

          // Remove any 'pre-signature' steps
          if (bidDetails.every((d) => d.kind !== "payment-processor")) {
            steps = steps.filter((s) => s.id !== "pre-signatures");
          }

          // Force the client to poll
          steps[3].items.push({
            status: "incomplete",
            tip: "This step is dependent on a previous step. Once you've completed it, re-call the API to get the data for this step.",
          });

          // Return an early since any next steps are dependent on the approvals
          return {
            steps,
            path,
          };
        } else {
          steps[1].items.push({
            status: "complete",
          });
        }
      }

      // For some orders (OS protected and Blur), we need to ensure the taker owns the NFTs to get sold
      for (const d of bidDetails.filter((d) => d.isProtected || d.source === "blur.io")) {
        const ownershipResult = await idb.oneOrNone(
          `
            SELECT
              floor(extract(epoch FROM acquired_at)) AS acquired_at
            FROM nft_balances
            WHERE nft_balances.contract = $/contract/
              AND nft_balances.token_id = $/tokenId/
              AND nft_balances.amount >= $/quantity/
              AND nft_balances.owner = $/owner/
            LIMIT 1
          `,
          {
            contract: toBuffer(d.contract),
            tokenId: d.tokenId,
            quantity: d.amount ?? 1,
            owner: toBuffer(payload.taker),
          }
        );
        if (!ownershipResult) {
          throw getExecuteError("Taker is not the owner of the token to sell");
        }
        if (
          d.source === "blur.io" &&
          ownershipResult.acquired_at &&
          ownershipResult.acquired_at >= now() - 30 * 60
        ) {
          throw getExecuteError("Accepting offers is disabled for this nft");
        }
      }

      const router = new Sdk.RouterV6.Router(config.chainId, baseProvider, {
        x2y2ApiKey: payload.x2y2ApiKey ?? config.x2y2ApiKey,
        openseaApiKey: payload.openseaApiKey,
        cbApiKey: config.cbApiKey,
        zeroExApiKey: config.zeroExApiKey,
        nftxApiKey: config.nftxApiKey,
        orderFetcherBaseUrl: config.orderFetcherBaseUrl,
        orderFetcherMetadata: {
          apiKey: await ApiKeyManager.getApiKey(request.headers["x-api-key"]),
        },
      });

      const { customTokenAddresses } = getNetworkSettings();
      const forceApprovalProxy =
        payload.forceRouter || customTokenAddresses.includes(bidDetails[0].contract);

      const errors: { orderId: string; message: string }[] = [];

      let result: FillBidsResult;
      try {
        result = await router.fillBidsTx(bidDetails, payload.taker, {
          source: payload.source,
          partial: payload.partial,
          sellOutCurrency,
          forceApprovalProxy,
          onError: async (kind, error, data) => {
            errors.push({
              orderId: data.orderId,
              message: error.response?.data ? JSON.stringify(error.response.data) : error.message,
            });
            await fillErrorCallback(kind, error, data);
          },
          blurAuth,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        throw getExecuteError(error.message, errors);
      }

      const { preTxs, txs, success } = result;

      // Filter out any non-fillable orders from the path
      path = path.filter((p) => success[p.orderId]);

      if (!path.length) {
        throw getExecuteError("No fillable orders");
      }

      for (const preTx of preTxs) {
        steps[4].items.push({
          status: "incomplete",
          orderIds: preTx.orderIds,
          data: {
            ...preTx.txData,
            maxFeePerGas,
            maxPriorityFeePerGas,
          },
        });
      }

      const approvals = txs.map(({ approvals }) => approvals).flat();
      for (const approval of approvals) {
        const isApproved = await commonHelpers.getNftApproval(
          approval.contract,
          approval.owner,
          approval.operator
        );
        if (!isApproved) {
          steps[1].items.push({
            status: "incomplete",
            orderIds: approval.orderIds,
            data: {
              ...approval.txData,
              maxFeePerGas,
              maxPriorityFeePerGas,
            },
          });
        }
      }

      const ftApprovals = txs.map(({ ftApprovals }) => ftApprovals ?? []).flat();
      for (const approval of ftApprovals) {
        const approvedAmount = await onChainData
          .fetchAndUpdateFtApproval(approval.currency, approval.owner, approval.operator)
          .then((a) => a.value);

        const isApproved = bn(approvedAmount).gte(approval.amount);
        if (!isApproved) {
          steps[2].items.push({
            status: "incomplete",
            data: {
              ...approval.txData,
              maxFeePerGas,
              maxPriorityFeePerGas,
            },
          });
        }
      }

      for (const { txData, txTags, orderIds, preSignatures } of txs) {
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

        steps[5].items.push({
          status: "incomplete",
          orderIds,
          data: !steps[3].items.length
            ? {
                ...txData,
                maxFeePerGas,
                maxPriorityFeePerGas,
              }
            : undefined,
          gasEstimate: txTags ? estimateGasFromTxTags(txTags) : undefined,
        });
      }

      // Warning! When filtering the steps, we should ensure that it
      // won't affect the client, which might be polling the API and
      // expect to get the steps returned in the same order / at the
      // same index.
      if (!blurAuth) {
        // If we reached this point and the Blur auth is missing then we
        // can be sure that no Blur orders were requested and it is safe
        // to remove the auth step
        steps = steps.filter((s) => s.id !== "auth");
      }
      if (!bidDetails.some((d) => d.kind === "payment-processor")) {
        // For now, pre-signatures are only needed for `payment-processor` orders
        steps = steps.filter((s) => s.id !== "pre-signatures");
      }

      const executionsBuffer = new ExecutionsBuffer();
      for (const item of path) {
        const txData = txs.find((tx) => tx.orderIds.includes(item.orderId))?.txData;

        let orderId = item.orderId;
        if (txData && item.source === "blur.io") {
          // Blur bids don't have the correct order id so we have to override it
          const orders = await new Sdk.Blur.Exchange(config.chainId).getMatchedOrdersFromCalldata(
            baseProvider,
            txData!.data
          );

          const index = orders.findIndex(
            ({ sell }) =>
              sell.params.collection === item.contract && sell.params.tokenId === item.tokenId
          );
          if (index !== -1) {
            orderId = orders[index].buy.hash();
          }
        }

        executionsBuffer.addFromRequest(request, {
          side: "sell",
          action: "fill",
          user: payload.taker,
          orderId,
          quantity: item.quantity,
          ...txData,
        });
      }
      const requestId = await executionsBuffer.flush();

      const perfTime2 = performance.now();

      logger.info(
        "execute-sell-v7-performance",
        JSON.stringify({
          kind: "total-performance",
          totalTime: (perfTime2 - perfTime1) / 1000,
          items: bidDetails.map((b) => ({ orderKind: b.kind, isProtected: b.isProtected })),
          itemsCount: bidDetails.length,
        })
      );

      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);
      logger.info(
        `get-execute-sell-${version}-handler`,
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
        `get-execute-sell-${version}-handler`,
        JSON.stringify({
          request: payload,
          uuid: randomUUID(),
          httpCode: error instanceof Boom.Boom ? error.output.statusCode : 500,
          error:
            error instanceof Boom.Boom ? error.output.payload : { error: "Internal Server Error" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          stack: (error as any).stack,
          apiKey,
        })
      );

      throw error;
    }
  },
};
