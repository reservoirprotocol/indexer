import { BigNumber } from "@ethersproject/bignumber";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import * as SeaportPermit from "@reservoir0x/sdk/dist/router/v6/permits/seaport";
import { BidDetails } from "@reservoir0x/sdk/dist/router/v6/types";
import Joi from "joi";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, formatPrice, fromBuffer, now, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { Sources } from "@/models/sources";
import { OrderKind, generateBidDetailsV6 } from "@/orderbook/orders";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as nftx from "@/orderbook/orders/nftx";
import * as sudoswap from "@/orderbook/orders/sudoswap";
import { getCurrency } from "@/utils/currencies";
import { getPermitId, getPermit, savePermit } from "@/utils/permits/nft";
import { tryGetTokensSuspiciousStatus } from "@/utils/opensea";

const version = "v7";

export const getExecuteSellV7Options: RouteOptions = {
  description: "Sell tokens (accept bids)",
  tags: ["api", "x-experimental"],
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
                  "opensea",
                  "looks-rare",
                  "zeroex-v4",
                  "seaport",
                  "x2y2",
                  "universe",
                  "rarible",
                  "infinity",
                  "sudoswap",
                  "nftx"
                )
                .required(),
              data: Joi.object().required(),
            }).description("Optional raw order to sell into."),
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
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the filling path will be returned."),
      normalizeRoyalties: Joi.boolean().default(false).description("Charge any missing royalties."),
      allowInactiveOrderIds: Joi.boolean()
        .default(false)
        .description(
          "If true, inactive orders will not be skipped over (only relevant when filling via a specific order id)."
        ),
      partial: Joi.boolean()
        .default(false)
        .description("If true, any off-chain or on-chain errors will be skipped."),
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
    }).label(`getExecuteSell${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-sell-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    try {
      // Keep track of the bids and path to fill
      const bidDetails: BidDetails[] = [];
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
      const getMakerBalancesKey = (maker: string, currency: string) => `${maker}-${currency}`;
      const makerBalances: { [makerAndCurrency: string]: BigNumber } = {};
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
          builtInFeeBps: number;
          feesOnTop?: Sdk.RouterV6.Types.Fee[];
        },
        token: {
          kind: "erc721" | "erc1155";
          contract: string;
          tokenId: string;
          quantity?: number;
          owner?: string;
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

        // Decrement the maker's available FT balance
        const price = bn(order.price).mul(quantity);
        const key = getMakerBalancesKey(order.maker, order.currency);
        if (!makerBalances[key]) {
          makerBalances[key] = await commonHelpers.getFtBalance(order.currency, order.maker);
        }
        makerBalances[key] = makerBalances[key].sub(price);

        const netPrice = price.sub(price.mul(order.builtInFeeBps).div(10000)).sub(totalFeeOnTop);
        path.push({
          orderId: order.id,
          contract: token.contract,
          tokenId: token.tokenId,
          quantity,
          source: order.sourceId !== null ? sources.get(order.sourceId)?.domain ?? null : null,
          currency: order.currency,
          quote: formatPrice(netPrice, (await getCurrency(order.currency)).decimals, true),
          rawQuote: netPrice.toString(),
        });

        bidDetails.push(
          await generateBidDetailsV6(
            {
              id: order.id,
              kind: order.kind,
              unitPrice: order.price,
              rawData: order.rawData,
              fees: feesOnTop,
            },
            {
              kind: token.kind,
              contract: token.contract,
              tokenId: token.tokenId,
              amount: token.quantity,
              owner: token.owner,
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
      }[] = payload.items;

      const tokenToSuspicious = await tryGetTokensSuspiciousStatus(items.map((i) => i.token));
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
            throw Boom.badData("Unknown token");
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
                AND orders.quantity_remaining >= $/quantity/
                AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                ${
                  payload.allowInactiveOrderIds
                    ? ""
                    : " AND orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'"
                }
            `,
            {
              id: item.orderId,
              contract: toBuffer(contract),
              tokenId,
              quantity: item.quantity,
            }
          );
          if (!result) {
            if (payload.partial) {
              continue;
            } else {
              throw Boom.badData(
                `Order ${item.orderId} not found or not fillable with token ${item.token}`
              );
            }
          }

          // Partial Seaport orders require knowing the owner
          let owner: string | undefined;
          if (["seaport-partial", "seaport-v1.4-partial"].includes(result.kind)) {
            const ownerResult = await idb.oneOrNone(
              `
                SELECT
                  nft_balances.owner
                FROM nft_balances
                WHERE nft_balances.contract = $/contract/
                  AND nft_balances.token_id = $/tokenId/
                  AND nft_balances.amount >= $/quantity/
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

          // Do not fill X2Y2 and Seaport orders with flagged tokens
          if (
            ["x2y2", "seaport", "seaport-v1.4", "seaport-partial", "seaport-v1.4-partial"].includes(
              result.kind
            )
          ) {
            if (
              (tokenToSuspicious.has(item.token) && tokenToSuspicious.get(item.token)) ||
              tokenResult.is_flagged
            ) {
              if (payload.partial) {
                continue;
              } else {
                throw Boom.badData(`Token ${item.token} is flagged`);
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
              builtInFeeBps: result.fee_bps,
              feesOnTop: result.missing_royalties,
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
                orders.fee_bps
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE token_sets_tokens.contract = $/contract/
                AND token_sets_tokens.token_id = $/tokenId/
                AND orders.side = 'buy'
                AND orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'
                AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
              ORDER BY ${
                payload.normalizeRoyalties ? "orders.normalized_value" : "orders.value"
              } DESC
            `,
            {
              id: item.orderId,
              contract: toBuffer(contract),
              tokenId,
              quantity: item.quantity,
            }
          );

          let quantityToFill = item.quantity;
          for (const result of orderResults) {
            // Partial Seaport orders require knowing the owner
            let owner: string | undefined;
            if (["seaport-partial", "seaport-v1.4-partial"].includes(result.kind)) {
              const ownerResult = await idb.oneOrNone(
                `
                  SELECT
                    nft_balances.owner
                  FROM nft_balances
                  WHERE nft_balances.contract = $/contract/
                    AND nft_balances.token_id = $/tokenId/
                    AND nft_balances.amount >= $/quantity/
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

            // Do not fill X2Y2 and Seaport orders with flagged tokens
            if (
              [
                "x2y2",
                "seaport",
                "seaport-v1.4",
                "seaport-partial",
                "seaport-v1.4-partial",
              ].includes(result.kind)
            ) {
              if (
                (tokenToSuspicious.has(item.token) && tokenToSuspicious.get(item.token)) ||
                tokenResult.is_flagged
              ) {
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

            // Account for the already filled maker's balance
            const maker = fromBuffer(result.maker);
            const currency = fromBuffer(result.currency);
            const key = getMakerBalancesKey(maker, currency);
            if (makerBalances[key]) {
              const makerAvailableQuantity = makerBalances[key].div(result.price).toNumber();
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
                currency,
                rawData: result.raw_data,
                builtInFeeBps: result.fee_bps,
                feesOnTop: result.missing_royalties,
              },
              {
                kind: result.token_kind,
                contract,
                tokenId,
                quantity: availableQuantity,
                owner,
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

      const router = new Sdk.RouterV6.Router(config.chainId, baseProvider, {
        x2y2ApiKey: payload.x2y2ApiKey ?? config.x2y2ApiKey,
        cbApiKey: config.cbApiKey,
      });

      const { customTokenAddresses } = getNetworkSettings();
      const forcePermit = customTokenAddresses.includes(bidDetails[0].contract);
      const { txData, success, approvals, permits } = await router.fillBidsTx(
        bidDetails,
        payload.taker,
        {
          source: payload.source,
          partial: payload.partial,
          forcePermit,
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
          id: "nft-approval",
          action: "Approve NFT contract",
          description:
            "Each NFT collection you want to trade requires a one-time approval transaction",
          kind: "transaction",
          items: [],
        },
        {
          id: "permit",
          action: "Sign permits",
          description: "Sign permits for accessing the NFTs in your wallet",
          kind: "signature",
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

      for (const approval of approvals) {
        const isApproved = await commonHelpers.getNftApproval(
          approval.contract,
          approval.owner,
          approval.operator
        );
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

      const permitHandler = new SeaportPermit.Handler(config.chainId, baseProvider);
      if (permits.length) {
        for (const permit of permits) {
          const id = getPermitId(request.payload as object, permit.tokens);

          let cachedPermit = await getPermit(id);
          if (cachedPermit) {
            // Always use the cached permit details
            permit.details = cachedPermit.details;

            // If the cached permit has a signature attached to it, we can skip it
            const hasSignature = (permit.details.data as SeaportPermit.Data).order.signature;
            if (hasSignature) {
              continue;
            }
          } else {
            // Cache the permit if it's the first time we encounter it
            await savePermit(
              id,
              permit,
              // Give a 1 minute buffer for the permit to expire
              (permit.details.data as SeaportPermit.Data).order.endTime - now() - 60
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
                  kind: "nft-permit",
                  id,
                },
              },
            },
          });
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
          `get-execute-sell-${version}-handler`,
          `Handler failure: ${error} (path = ${JSON.stringify({})}, request = ${JSON.stringify(
            payload
          )})`
        );
      }
      throw error;
    }
  },
};
