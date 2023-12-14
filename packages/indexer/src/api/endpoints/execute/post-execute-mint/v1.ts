import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { MintDetails } from "@reservoir0x/sdk/dist/router/v6/types";
import { estimateGasFromTxTags, initializeTxTags } from "@reservoir0x/sdk/dist/router/v6/utils";
import axios from "axios";
import { randomUUID } from "crypto";
import Joi from "joi";
import _ from "lodash";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { JoiExecuteFee, JoiPrice, getJoiPriceObject } from "@/common/joi";
import { baseProvider } from "@/common/provider";
import { bn, formatPrice, regex, toBuffer } from "@/common/utils";
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
import { getExecuteError } from "@/orderbook/orders/errors";
import { getCurrency } from "@/utils/currencies";
import { ExecutionsBuffer } from "@/utils/executions";

const version = "v1";

export const postExecuteMintV1Options: RouteOptions = {
  description: "Mint Tokens",
  notes:
    "Use this API to mint tokens. We recommend using the SDK over this API as the SDK will iterate through the steps and return callbacks.",
  tags: ["api", "Trading"],
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
            collection: Joi.string().lowercase().description("Collection to mint."),
            token: Joi.string().lowercase().pattern(regex.token).description("Token to mint."),
            custom: Joi.object({
              contract: Joi.string().pattern(regex.address).required(),
              price: Joi.string().pattern(regex.number).required(),
              details: Joi.object({
                tx: Joi.object({
                  to: Joi.string()
                    .pattern(regex.address)
                    .required()
                    .description("Contract where to send the mint transaction"),
                  data: Joi.object({
                    signature: Joi.string()
                      .pattern(regex.bytes)
                      .required()
                      .description(
                        "Signature of the mint function, computed as keccak256. For example: keccak256('mintWithRewards(address,uint256,uint256,bytes,address)'))"
                      ),
                    params: Joi.array()
                      .items(
                        Joi.object({
                          abiType: Joi.string().required(),
                          abiValue: Joi.any().required(),
                        })
                      )
                      .description(
                        "Parameters to be passed into the mint method, each parameter is made up of a type and a value."
                      ),
                  }),
                }),
              }).required(),
            }).description("Optional custom details to use for minting."),
            quantity: Joi.number().integer().positive().description("Quantity of tokens to mint."),
          })
            .oxor("token", "collection", "custom")
            .or("token", "collection", "custom")
        )
        .min(1)
        .required()
        .description("List of items to mint."),
      taker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description("Address of wallet minting (receiver of the NFT)."),
      relayer: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description("Address of wallet relaying the mint transaction(s) (paying for the NFT)."),
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the path will be returned."),
      alternativeCurrencies: Joi.array()
        .items(Joi.string().lowercase())
        .description("Alternative currencies to return the quote in."),
      currencyChainId: Joi.number().description("The chain id of the purchase currency."),
      source: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .description("Filling source used for attribution. Example: `reservoir.market`"),
      feesOnTop: Joi.array()
        .items(Joi.string().pattern(regex.fee))
        .description(
          "List of fees (formatted as `feeRecipient:feeAmount`) to be taken when minting.\nUnless overridden via the `currency` param, the currency used for any fees on top matches the buy-in currency detected by the backend.\nExample: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00:1000000000000000`"
        ),
      partial: Joi.boolean()
        .default(false)
        .description("If true, any off-chain or on-chain errors will be skipped."),
      skipBalanceCheck: Joi.boolean()
        .default(false)
        .description("If true, balance checks will be skipped."),
      referrer: Joi.string()
        .pattern(regex.address)
        .optional()
        .description("Referrer address (where supported)."),
      comment: Joi.string().optional().description("Mint comment (where suported)."),
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
          totalPrice: Joi.number().unsafe(),
          totalRawPrice: Joi.string().pattern(regex.number),
          buyIn: Joi.array().items(JoiPrice),
          gasCost: Joi.string().pattern(regex.number),
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
      gasEstimate: Joi.number(),
    }).label(`postExecuteMint${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-execute-mint-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    // Needed for cross-chain solving which works off the original request
    const originalPayload = _.cloneDeep(payload);

    try {
      type ExecuteFee = {
        kind?: string;
        recipient: string;
        bps?: number;
        amount: number;
        rawAmount: string;
      };

      // Keep track of any mint details
      const mintDetails: MintDetails[] = [];

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
        // Total price (with fees on top) = price + feesOnTop
        totalPrice?: number;
        totalRawPrice?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        buyIn?: any[];
        feesOnTop: ExecuteFee[];
        gasCost?: string;
        fromChainId?: number;
      }[] = [];

      const sources = await Sources.getInstance();
      const feeRecipients = await FeeRecipients.getInstance();

      // Save the fill source if it doesn't exist yet
      if (payload.source) {
        await sources.getOrInsert(payload.source);
      }

      // First pass at estimating the gas costs
      const txTags = initializeTxTags();

      const addToPath = async (
        order: {
          id: string;
          maker: string;
          nativePrice: string;
          price: string;
          sourceId: number | null;
          currency: string;
          additionalFees?: Sdk.RouterV6.Types.Fee[];
        },
        token: {
          kind: "erc721" | "erc1155";
          contract: string;
          tokenId?: string;
          quantity?: number;
        }
      ) => {
        const quantity = token.quantity ?? 1;
        const unitPrice = bn(order.price);
        const additionalFees = order.additionalFees ?? [];

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

        txTags.feesOnTop! += additionalFees.length;
        txTags.mints! += 1;
      };

      const items: {
        token?: string;
        collection?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        custom?: {
          contract: string;
          price: string;
          details: {
            tx: {
              to: string;
              data: {
                signature: string;
                params: {
                  abiType: string;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  abiValue: any;
                }[];
              };
            };
          };
        };
        quantity: number;
        originalItemIndex?: number;
      }[] = payload.items;

      // Keep track of the maximum quantity available per item
      // (only relevant when the below `preview` field is true)
      const maxQuantities: {
        itemIndex: number;
        maxQuantity: string | null;
      }[] = [];
      const preview = payload.onlyPath && payload.partial && items.every((i) => !i.quantity);

      const useCrossChainIntent =
        payload.currencyChainId !== undefined && payload.currencyChainId !== config.chainId;

      let lastError: string | undefined;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemIndex =
          items[i].originalItemIndex !== undefined ? items[i].originalItemIndex! : i;

        if (!item.quantity) {
          if (preview) {
            item.quantity = useCrossChainIntent ? 1 : 30;
          } else {
            item.quantity = 1;
          }
        }

        // Scenario 1: fill via `custom`
        if (item.custom) {
          const rawMint = {
            ...item.custom,
            collection: item.custom.contract,
          } as PartialCollectionMint;

          // Hack: As the raw order is processed, set it to the `orderId`
          // field so that it will get handled by the next pipeline step
          // of this same API rather than doing anything custom for it.

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
                maker: collectionMint.contract,
                nativePrice: price,
                price: price,
                sourceId: null,
                currency: collectionMint.currency,
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
        }

        // Scenario 2: fill via `collection`
        if (item.collection) {
          let hasActiveMints = false;
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
                      maker: mint.contract,
                      nativePrice: price,
                      price: price,
                      sourceId: null,
                      currency: mint.currency,
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
                } catch {
                  // Skip errors
                  // Mostly coming from allowlist mints for which the user is not authorized
                  // TODO: Have an allowlist check instead of handling it via `try` / `catch`
                }
              }

              hasActiveMints = true;
            }
          }

          if (item.quantity > 0) {
            if (!hasActiveMints) {
              lastError = "Collection has no eligible mints";
            } else {
              lastError =
                "Unable to mint requested quantity (max mints per wallet possibly exceeded)";
            }

            if (!payload.partial) {
              throw getExecuteError(lastError);
            }
          }
        }

        // Scenario 3: fill via `token`
        if (item.token) {
          const [contract, tokenId] = item.token.split(":");

          let hasActiveMints = false;

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
                      maker: mint.contract,
                      nativePrice: price,
                      price: price,
                      sourceId: null,
                      currency: mint.currency,
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
                } catch {
                  // Skip errors
                  // Mostly coming from allowlist mints for which the user is not authorized
                  // TODO: Have an allowlist check instead of handling it via `try` / `catch`
                }
              }

              hasActiveMints = true;
            }
          }

          if (item.quantity > 0) {
            if (!hasActiveMints) {
              lastError = "Token has no eligible mints";
            } else {
              lastError =
                "Unable to mint requested quantity (max mints per wallet possibly exceeded)";
            }

            if (!payload.partial) {
              throw getExecuteError(lastError);
            }
          }
        }
      }

      if (!path.length) {
        throw getExecuteError(lastError ?? "No fillable orders");
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

      const addGlobalFee = async (
        detail: MintDetails,
        item: (typeof path)[0],
        fee: Sdk.RouterV6.Types.Fee
      ) => {
        // The fees should be relative to a single quantity
        const feeAmount = bn(fee.amount).div(item.quantity).toString();

        // Global fees get split across all eligible orders
        const adjustedFeeAmount = bn(feeAmount).div(mintDetails.length).toString();

        const amount = formatPrice(
          adjustedFeeAmount,
          (await getCurrency(item.currency)).decimals,
          true
        );
        const rawAmount = bn(adjustedFeeAmount).toString();

        // To avoid numeric overflow and division by zero
        const maxBps = bn(10000);
        const bps = bn(item.rawQuote).gt(0) ? bn(feeAmount).mul(10000).div(item.rawQuote) : maxBps;

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
        if (globalFees.length && mintDetails.map((d) => d.orderId).includes(item.orderId)) {
          for (const f of globalFees) {
            const detail = mintDetails.find((d) => d.orderId === item.orderId);
            if (detail) {
              await addGlobalFee(detail, item, f);
            }
          }
        } else {
          item.totalPrice = item.quote;
          item.totalRawPrice = item.rawQuote;
        }
      }

      const getCrossChainQuote = async () => {
        const ccConfig: {
          enabled: boolean;
          user?: {
            balance: string;
          };
          solver?: {
            address: string;
            maxCost: string;
          };
        } = await axios
          .get(
            `${config.crossChainSolverBaseUrl}/config?originChainId=${
              originalPayload.currencyChainId
            }&destinationChainId=${config.chainId}&user=${originalPayload.taker}&currency=${
              Sdk.Common.Addresses.Native[originalPayload.currencyChainId]
            }`
          )
          .then((response) => response.data);

        if (!ccConfig.enabled) {
          throw Boom.badRequest("Cross-chain request not supported between requested chains");
        }

        const data = {
          request: {
            originChainId: originalPayload.currencyChainId,
            destinationChainId: config.chainId,
            data: originalPayload,
            endpoint: "/execute/mint/v1",
            salt: Math.floor(Math.random() * 1000000),
          },
        };

        const { requestId, price, fee } = await axios
          .post(`${config.crossChainSolverBaseUrl}/intents/quote`, data)
          .then((response) => ({
            requestId: response.data.requestId,
            price: response.data.price,
            fee: response.data.fee,
          }))
          .catch((error) => {
            throw Boom.badRequest(
              error.response?.data ? JSON.stringify(error.response.data) : "Error getting quote"
            );
          });

        if (
          ccConfig.solver?.maxCost &&
          bn(price).add(fee).gt(ccConfig.solver.maxCost) &&
          !preview
        ) {
          throw Boom.badRequest("Cost too high");
        }

        return {
          requestId,
          request: data.request,
          price,
          fee,
          user: ccConfig.user!,
          solver: ccConfig.solver!,
        };
      };

      // Add the quotes in the "buy-in" currency to the path items
      for (const item of path) {
        if (payload.alternativeCurrencies) {
          if (preview) {
            throw Boom.badRequest("Cannot use alternative currencies with preview");
          }

          if (!item.buyIn) {
            item.buyIn = [];
          }

          // Add the first path item's currency in the `alternativeCurrencies` list
          const firstPathItemCurrency = `${path[0].currency}:${config.chainId}`;
          if (!payload.alternativeCurrencies.includes(firstPathItemCurrency)) {
            payload.alternativeCurrencies.push(firstPathItemCurrency);
          }

          await Promise.all(
            payload.alternativeCurrencies.map(async (c: string) => {
              try {
                const [currency, chainId] = c.split(":");

                const { price, fee } = await getCrossChainQuote();
                item.buyIn!.push(
                  await getJoiPriceObject(
                    {
                      gross: { amount: bn(price).add(fee).toString() },
                    },
                    currency
                  ).then((p) => ({
                    ...p,
                    currency: {
                      ...p.currency,
                      chainId: Number(chainId),
                    },
                  }))
                );
              } catch {
                // Skip errors
              }
            })
          );
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
      const steps: StepType[] = [
        {
          id: "sale",
          action: "Confirm transaction in your wallet",
          description: "To mint these items you must confirm the transaction and pay the gas fee",
          kind: "transaction",
          items: [],
        },
      ];

      if (payload.onlyPath && !useCrossChainIntent) {
        return {
          path,
          maxQuantities: preview ? maxQuantities : undefined,
          gasEstimate: estimateGasFromTxTags(txTags),
        };
      }

      // Cross-chain intent purchasing MVP
      if (useCrossChainIntent) {
        if (!config.crossChainSolverBaseUrl) {
          throw Boom.badRequest("Cross-chain purchasing not supported");
        }

        if (path.length > 1) {
          throw Boom.badRequest("Only single item cross-chain purchases are supported");
        }

        const item = path[0];

        const data = await getCrossChainQuote();
        const cost = bn(data.price).add(data.fee);

        item.totalPrice = formatPrice(cost);
        item.totalRawPrice = cost.toString();
        item.quote = formatPrice(cost);
        item.rawQuote = cost.toString();
        item.gasCost = data.fee.toString();

        const needsDeposit = bn(data.user.balance).lt(cost);
        if (payload.onlyPath) {
          return {
            path,
            maxQuantities: preview ? maxQuantities : undefined,
            gasEstimate: needsDeposit ? 21000 : 0,
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

        if (needsDeposit) {
          customSteps[0].items.push({
            status: "incomplete",
            data: {
              from: payload.taker,
              to: data.solver.address,
              data: data.requestId,
              value: bn(cost).sub(data.user.balance).toString(),
              chainId: payload.currencyChainId,
            },
            check: {
              endpoint: "/execute/status/v1",
              method: "POST",
              body: {
                kind: "cross-chain-intent",
                id: data.requestId,
              },
            },
          });

          // Trigger to force the solver to start listening to incoming transactions
          await axios.post(`${config.crossChainSolverBaseUrl}/intents/trigger`, {
            request: data.request,
          });
        } else {
          customSteps[1].items.push({
            status: "incomplete",
            data: {
              sign: {
                signatureKind: "eip191",
                message: data.requestId,
              },
              post: {
                endpoint: "/execute/solve/v1",
                method: "POST",
                body: {
                  kind: "cross-chain-intent",
                  request: data.request,
                },
              },
            },
            check: {
              endpoint: "/execute/status/v1",
              method: "POST",
              body: {
                kind: "cross-chain-intent",
                id: data.requestId,
              },
            },
          });
        }

        return {
          steps: customSteps.filter((s) => s.items.length),
          path,
        };
      }

      const errors: { orderId: string; message: string }[] = [];

      const router = new Sdk.RouterV6.Router(config.chainId, baseProvider, {
        x2y2ApiKey: payload.x2y2ApiKey ?? config.x2y2ApiKey,
        openseaApiKey: payload.openseaApiKey,
        cbApiKey: config.cbApiKey,
        zeroExApiKey: config.zeroExApiKey,
        orderFetcherBaseUrl: config.orderFetcherBaseUrl,
        orderFetcherMetadata: {
          apiKey: await ApiKeyManager.getApiKey(request.headers["x-api-key"]),
        },
      });

      // Add any mint transactions

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

      const { txs, success } = mintsResult;

      // Filter out any non-fillable orders from the path
      path = path.filter((p) => success[p.orderId]);

      if (!path.length) {
        throw getExecuteError("No fillable mints");
      }

      // Check that the transaction sender has enough funds to fill all requested tokens
      const txSender = payload.relayer ?? payload.taker;

      for (const { txData, txTags, orderIds } of txs) {
        // Get the price in the buy-in currency via the transaction value
        const totalBuyInCurrencyPrice = bn(txData.value ?? 0);

        const balance = await baseProvider.getBalance(txSender);
        if (!payload.skipBalanceCheck && bn(balance).lt(totalBuyInCurrencyPrice)) {
          throw getExecuteError("Balance too low to proceed with transaction");
        }

        steps[0].items.push({
          status: "incomplete",
          orderIds,
          data: txData,
          check: {
            endpoint: "/execute/status/v1",
            method: "POST",
            body: {
              kind: "transaction",
            },
          },
          gasEstimate: txTags ? estimateGasFromTxTags(txTags) : undefined,
        });
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

      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);
      logger.info(
        `post-execute-mint-${version}-handler`,
        JSON.stringify({
          request: payload,
          apiKey,
        })
      );

      return {
        requestId,
        steps,
        errors,
        path,
      };
    } catch (error) {
      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);
      logger.error(
        `post-execute-mint-${version}-handler`,
        JSON.stringify({
          request: payload,
          uuid: randomUUID(),
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
