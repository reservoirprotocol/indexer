/* eslint-disable @typescript-eslint/no-explicit-any */

import { BigNumber } from "@ethersproject/bignumber";
import { MaxUint256 } from "@ethersproject/constants";
import { _TypedDataEncoder } from "@ethersproject/hash";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { PermitHandler } from "@reservoir0x/sdk/dist/router/v6/permit";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import axios from "axios";
import { randomUUID } from "crypto";
import Joi from "joi";
import _ from "lodash";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, now, regex } from "@/common/utils";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";
import { FeeRecipients } from "@/models/fee-recipients";
import { getExecuteError } from "@/orderbook/orders/errors";
import { OrderKind, checkBlacklistAndFallback } from "@/orderbook/orders";
import * as b from "@/utils/auth/blur";
import * as e from "@/utils/auth/erc721c";
import * as erc721c from "@/utils/erc721c";
import { ExecutionsBuffer } from "@/utils/executions";
import { getEphemeralPermit, getEphemeralPermitId, saveEphemeralPermit } from "@/utils/permits";

// Blur
import * as blurBuyCollection from "@/orderbook/orders/blur/build/buy/collection";

// LooksRare
import * as looksRareV2BuyToken from "@/orderbook/orders/looks-rare-v2/build/buy/token";
import * as looksRareV2BuyCollection from "@/orderbook/orders/looks-rare-v2/build/buy/collection";

// Seaport v1.5
import * as seaportV15BuyAttribute from "@/orderbook/orders/seaport-v1.5/build/buy/attribute";
import * as seaportV15BuyToken from "@/orderbook/orders/seaport-v1.5/build/buy/token";
import * as seaportV15BuyCollection from "@/orderbook/orders/seaport-v1.5/build/buy/collection";

// Alienswap
import * as alienswapBuyAttribute from "@/orderbook/orders/alienswap/build/buy/attribute";
import * as alienswapBuyToken from "@/orderbook/orders/alienswap/build/buy/token";
import * as alienswapBuyCollection from "@/orderbook/orders/alienswap/build/buy/collection";

// X2Y2
import * as x2y2BuyCollection from "@/orderbook/orders/x2y2/build/buy/collection";
import * as x2y2BuyToken from "@/orderbook/orders/x2y2/build/buy/token";

// ZeroExV4
import * as zeroExV4BuyAttribute from "@/orderbook/orders/zeroex-v4/build/buy/attribute";
import * as zeroExV4BuyToken from "@/orderbook/orders/zeroex-v4/build/buy/token";
import * as zeroExV4BuyCollection from "@/orderbook/orders/zeroex-v4/build/buy/collection";

// PaymentProcessor
import * as paymentProcessorBuyToken from "@/orderbook/orders/payment-processor/build/buy/token";
import * as paymentProcessorBuyCollection from "@/orderbook/orders/payment-processor/build/buy/collection";

// PaymentProcessorV2
import * as paymentProcessorV2BuyToken from "@/orderbook/orders/payment-processor-v2/build/buy/token";
import * as paymentProcessorV2BuyCollection from "@/orderbook/orders/payment-processor-v2/build/buy/collection";
import * as paymentProcessorV2BuyAttribute from "@/orderbook/orders/payment-processor-v2/build/buy/attribute";

const version = "v5";

export const getExecuteBidV5Options: RouteOptions = {
  description: "Create Bids",
  notes:
    "Generate bids and submit them to multiple marketplaces.\n\n Notes:\n\n- Please use the `/cross-posting-orders/v1` to check the status on cross posted bids.\n\n- We recommend using Reservoir SDK as it abstracts the process of iterating through steps, and returning callbacks that can be used to update your UI.",
  timeout: { server: 60000 },
  tags: ["api"],
  plugins: {
    "hapi-swagger": {
      order: 11,
    },
  },
  validate: {
    payload: Joi.object({
      maker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Address of wallet making the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        )
        .required(),
      source: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .description(
          `Domain of your app that is creating the order, e.g. \`myapp.xyz\`. This is used for filtering, and to attribute the "order source" of sales in on-chain analytics, to help your app get discovered. Lean more <a href='https://docs.reservoir.tools/docs/calldata-attribution'>here</a>`
        ),
      blurAuth: Joi.string().description(
        "Advanced use case to pass personal blurAuthToken; the API will generate one if left empty."
      ),
      params: Joi.array()
        .items(
          Joi.object({
            token: Joi.string()
              .lowercase()
              .pattern(regex.token)
              .description(
                "Bid on a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
              ),
            tokenSetId: Joi.string().description(
              "Bid on a particular token set. Cannot be used with cross-posting to OpenSea. Example: `token:CONTRACT:TOKEN_ID` representing a single token within contract, `contract:CONTRACT` representing a whole contract, `range:CONTRACT:START_TOKEN_ID:END_TOKEN_ID` representing a continuous token id range within a contract and `list:CONTRACT:TOKEN_IDS_HASH` representing a list of token ids within a contract."
            ),
            collection: Joi.string()
              .lowercase()
              .description(
                "Bid on a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
              ),
            attributeKey: Joi.string().description(
              "Bid on a particular attribute key. This is case sensitive. Example: `Composition`"
            ),
            attributeValue: Joi.string().description(
              "Bid on a particular attribute value. This is case sensitive. Example: `Teddy (#33)`"
            ),
            quantity: Joi.number().description("Quantity of tokens to bid on."),
            weiPrice: Joi.string()
              .pattern(regex.number)
              .description(
                "Amount bidder is willing to offer in the smallest denomination for the specific currency. Example: `1000000000000000000`"
              )
              .required(),
            orderKind: Joi.string()
              .valid(
                "blur",
                "zeroex-v4",
                "seaport",
                "seaport-v1.4",
                "seaport-v1.5",
                "looks-rare",
                "looks-rare-v2",
                "x2y2",
                "alienswap",
                "payment-processor",
                "payment-processor-v2"
              )
              .default("seaport-v1.5")
              .description("Exchange protocol used to create order. Example: `seaport-v1.5`"),
            options: Joi.object({
              "seaport-v1.4": Joi.object({
                conduitKey: Joi.string().pattern(regex.bytes32),
                useOffChainCancellation: Joi.boolean().required(),
                replaceOrderId: Joi.string().when("useOffChainCancellation", {
                  is: true,
                  then: Joi.optional(),
                  otherwise: Joi.forbidden(),
                }),
              }),
              "seaport-v1.5": Joi.object({
                conduitKey: Joi.string().pattern(regex.bytes32),
                useOffChainCancellation: Joi.boolean().required(),
                replaceOrderId: Joi.string().when("useOffChainCancellation", {
                  is: true,
                  then: Joi.optional(),
                  otherwise: Joi.forbidden(),
                }),
              }),
              "payment-processor-v2": Joi.object({
                useOffChainCancellation: Joi.boolean().required(),
                cosigner: Joi.string().lowercase().optional(),
                replaceOrderId: Joi.string().when("useOffChainCancellation", {
                  is: true,
                  then: Joi.optional(),
                  otherwise: Joi.forbidden(),
                }),
              }),
            }).description("Additional options."),
            orderbook: Joi.string()
              .valid("blur", "reservoir", "opensea", "looks-rare", "x2y2")
              .default("reservoir")
              .description("Orderbook where order is placed. Example: `Reservoir`"),
            orderbookApiKey: Joi.string().description("Optional API key for the target orderbook"),
            automatedRoyalties: Joi.boolean()
              .default(true)
              .description("If true, royalty amounts and recipients will be set automatically."),
            royaltyBps: Joi.number().description(
              "Set a maximum amount of royalties to pay, rather than the full amount. Only relevant when using automated royalties. 1 BPS = 0.01% Note: OpenSea does not support values below 50 bps."
            ),
            fees: Joi.array()
              .items(Joi.string().pattern(regex.fee))
              .description("Deprecated, use `marketplaceFees` and/or `customRoyalties`"),
            marketplaceFees: Joi.array()
              .items(Joi.string().pattern(regex.fee))
              .description(
                "List of marketplace fees (formatted as `feeRecipient:feeBps`) to be bundled within the order. 1 BPS = 0.01% Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00:100`"
              ),
            marketplaceFlatFees: Joi.array()
              .items(Joi.string().pattern(regex.fee))
              .description(
                "List of marketplace flat fees (formatted as `feeRecipient:weiAmount`) to be bundled within the order."
              ),
            customRoyalties: Joi.array()
              .items(Joi.string().pattern(regex.fee))
              .description(
                "List of custom royalties (formatted as `feeRecipient:feeBps`) to be bundled within the order. 1 BPS = 0.01% Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00:100`"
              ),
            excludeFlaggedTokens: Joi.boolean()
              .default(false)
              .description("If true flagged tokens will be excluded"),
            listingTime: Joi.string()
              .pattern(regex.unixTimestamp)
              .description(
                "Unix timestamp (seconds) indicating when listing will be listed. Example: `1656080318`"
              ),
            expirationTime: Joi.string()
              .pattern(regex.unixTimestamp)
              .description(
                "Unix timestamp (seconds) indicating when listing will expire. Example: `1656080318`"
              ),
            salt: Joi.string()
              .pattern(regex.number)
              .description("Optional. Random string to make the order unique"),
            nonce: Joi.string().pattern(regex.number).description("Optional. Set a custom nonce"),
            currency: Joi.string()
              .pattern(regex.address)
              .lowercase()
              .default(Sdk.Common.Addresses.WNative[config.chainId]),
            usePermit: Joi.boolean().description("When true, will use permit to avoid approvals."),
          })
            .or("token", "collection", "tokenSetId")
            .oxor("token", "collection", "tokenSetId")
            .with("attributeValue", "attributeKey")
            .with("attributeKey", "attributeValue")
            .with("attributeKey", "collection")
        )
        .min(1),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string()
            .required()
            .description("Returns `currency-wrapping`, `currency-approval`, or `order-signature`."),
          kind: Joi.string()
            .valid("request", "signature", "transaction")
            .required()
            .description("Returns `request`, `signature`, or `transaction`."),
          action: Joi.string().required(),
          description: Joi.string().required(),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string()
                  .valid("complete", "incomplete")
                  .required()
                  .description("Returns `complete` or `incomplete`"),
                tip: Joi.string(),
                data: Joi.object(),
                orderIndexes: Joi.array().items(Joi.number()),
              })
            )
            .required(),
        })
      ),
      errors: Joi.array().items(
        Joi.object({
          message: Joi.string(),
          orderIndex: Joi.number(),
        })
      ),
    }).label(`getExecuteBid${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-bid-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    const executionsBuffer = new ExecutionsBuffer();
    const addExecution = (orderId: string, quantity?: number) =>
      executionsBuffer.addFromRequest(request, {
        side: "buy",
        action: "create",
        user: payload.maker,
        orderId,
        quantity: quantity ?? 1,
      });

    try {
      const maker = payload.maker as string;
      const source = payload.source as string | undefined;
      const params = payload.params as {
        token?: string;
        tokenSetId?: string;
        collection?: string;
        attributeKey?: string;
        attributeValue?: string;
        quantity?: number;
        weiPrice: string;
        options?: any;
        orderKind: OrderKind;
        orderbook: string;
        orderbookApiKey?: string;
        automatedRoyalties: boolean;
        royaltyBps?: number;
        excludeFlaggedTokens: boolean;
        fees?: string[];
        marketplaceFees?: string[];
        marketplaceFlatFees?: string[];
        customRoyalties?: string[];
        currency: string;
        listingTime?: number;
        expirationTime?: number;
        salt?: string;
        nonce?: string;
        usePermit?: string;
      }[];

      // Set up generic bid steps
      let steps: {
        id: string;
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          tip?: string;
          data?: any;
          orderIndexes?: number[];
        }[];
      }[] = [
        {
          id: "auth",
          action: "Sign auth challenge",
          description: "Before being able to bid, it might be needed to sign an auth challenge",
          kind: "signature",
          items: [],
        },
        {
          id: "currency-wrapping",
          action: "Wrapping currency",
          description:
            "We'll ask your approval to wrap the currency for bidding. Gas fee required.",
          kind: "transaction",
          items: [],
        },
        {
          id: "currency-approval",
          action: "Approve currency",
          description:
            "We'll ask your approval for the exchange to access your token. This is a one-time only operation per exchange.",
          kind: "transaction",
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
          id: "currency-permit",
          action: "Sign permits",
          description: "Sign permits for accessing the tokens in your wallet",
          kind: "signature",
          items: [],
        },
        {
          id: "order-signature",
          action: "Authorize offer",
          description: "A free off-chain signature to create the offer",
          kind: "signature",
          items: [],
        },
      ];

      // Keep track of orders which can be signed in bulk
      const bulkOrders = {
        "seaport-v1.5": [] as {
          order: {
            kind: "seaport-v1.5";
            data: Sdk.SeaportBase.Types.OrderComponents;
          };
          tokenSetId?: string;
          attribute?: {
            collection: string;
            key: string;
            value: string;
          };
          collection?: string;
          isNonFlagged?: boolean;
          permitId?: string;
          permitIndex?: number;
          orderbook: string;
          orderbookApiKey?: string;
          source?: string;
          orderIndex: number;
        }[],
        alienswap: [] as {
          order: {
            kind: "alienswap";
            data: Sdk.SeaportBase.Types.OrderComponents;
          };
          tokenSetId?: string;
          attribute?: {
            collection: string;
            key: string;
            value: string;
          };
          collection?: string;
          isNonFlagged?: boolean;
          orderbook: string;
          orderbookApiKey?: string;
          source?: string;
          orderIndex: number;
        }[],
      };

      // Handle Blur authentication
      let blurAuth: b.Auth | undefined;
      if (params.some((p) => p.orderKind === "blur")) {
        if (payload.blurAuth) {
          blurAuth = { accessToken: payload.blurAuth };
        } else {
          const blurAuthId = b.getAuthId(maker);

          blurAuth = await b.getAuth(blurAuthId);
          if (!blurAuth) {
            const blurAuthChallengeId = b.getAuthChallengeId(maker);

            let blurAuthChallenge = await b.getAuthChallenge(blurAuthChallengeId);
            if (!blurAuthChallenge) {
              blurAuthChallenge = (await axios
                .get(`${config.orderFetcherBaseUrl}/api/blur-auth-challenge?taker=${maker}`)
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
            };
          } else {
            steps[0].items.push({
              status: "complete",
            });
            steps[1].items.push({
              status: "complete",
              // Hacky fix for: https://github.com/reservoirprotocol/reservoir-kit/pull/391
              data: {},
            });
          }
        }
      }

      // Handle ERC721C authentication
      const unverifiedERC721CTransferValidators: string[] = [];
      await Promise.all(
        params.map(async (p) => {
          try {
            if (p.token || p.collection) {
              const contract = p.token ? p.token.split(":")[0] : p.collection!;

              const configV1 = await erc721c.v1.getConfig(contract);
              const configV2 = await erc721c.v2.getConfig(contract);
              if (
                (configV1 && [4, 6].includes(configV1.transferSecurityLevel)) ||
                (configV2 && [6, 8].includes(configV2.transferSecurityLevel))
              ) {
                const transferValidator = (configV1 ?? configV2)!.transferValidator;

                const isVerified = await erc721c.isVerifiedEOA(transferValidator, payload.maker);
                if (!isVerified) {
                  unverifiedERC721CTransferValidators.push(transferValidator);
                }
              }
            }
          } catch {
            // Skip errors
          }
        })
      );
      if (unverifiedERC721CTransferValidators.length) {
        const erc721cAuthId = e.getAuthId(payload.maker);

        const erc721cAuth = await e.getAuth(erc721cAuthId);
        if (!erc721cAuth) {
          const erc721cAuthChallengeId = e.getAuthChallengeId(payload.maker);

          let erc721cAuthChallenge = await e.getAuthChallenge(erc721cAuthChallengeId);
          if (!erc721cAuthChallenge) {
            erc721cAuthChallenge = {
              message: "EOA",
              walletAddress: payload.maker,
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
          };
        } else {
          steps[0].items.push({
            status: "complete",
          });
          steps[1].items.push({
            status: "complete",
            // Hacky fix for: https://github.com/reservoirprotocol/reservoir-kit/pull/391
            data: {},
          });
        }
      }

      const feeRecipients = await FeeRecipients.getInstance();

      const errors: { message: string; orderIndex: number }[] = [];
      await Promise.all(
        params.map(async (params, i) => {
          const token = params.token;
          const collectionId = params.collection;
          const tokenSetId = params.tokenSetId;
          const attributeKey = params.attributeKey;
          const attributeValue = params.attributeValue;

          // Force usage of seaport-v1.5
          if (params.orderKind === "seaport") {
            params.orderKind = "seaport-v1.5";
          }
          if (params.orderKind === "seaport-v1.4") {
            params.orderKind = "seaport-v1.5";
          }
          // Force usage of looks-rare-v2
          if (params.orderKind === "looks-rare") {
            params.orderKind = "looks-rare-v2";
          }

          // Blacklist checks
          if (collectionId) {
            await checkBlacklistAndFallback(collectionId, params);
          }
          if (token) {
            await checkBlacklistAndFallback(token.split(":")[0], params);
          }

          // Only single-contract token sets are biddable
          if (tokenSetId && tokenSetId.startsWith("list") && tokenSetId.split(":").length !== 3) {
            return errors.push({
              message: `Token set ${tokenSetId} is not biddable`,
              orderIndex: i,
            });
          }

          // TODO: Fix cross-posting collection bids to LooksRare and X2Y2
          if (!token && !["blur", "reservoir", "opensea"].includes(params.orderbook)) {
            return errors.push({
              message: `Only single-token bids are supported on orderbook ${params.orderbook}`,
              orderIndex: i,
            });
          }

          // Handle fees
          // TODO: Refactor the builders to get rid of the separate fee/feeRecipient arrays
          // TODO: Refactor the builders to get rid of the API params naming dependency
          (params as any).fee = [];
          (params as any).feeRecipient = [];
          for (const feeData of params.fees ?? []) {
            const [feeRecipient, fee] = feeData.split(":");
            (params as any).fee.push(fee);
            (params as any).feeRecipient.push(feeRecipient);
          }
          for (const feeData of params.marketplaceFees ?? []) {
            const [feeRecipient, fee] = feeData.split(":");
            (params as any).fee.push(fee);
            (params as any).feeRecipient.push(feeRecipient);
            await feeRecipients.create(feeRecipient, "marketplace", source);
          }
          for (const feeData of params.marketplaceFlatFees ?? []) {
            const [feeRecipient, weiAmount] = feeData.split(":");
            const unitPrice = bn(params.weiPrice).div(params.quantity ?? 1);
            const fee = bn(weiAmount).mul(10000).div(unitPrice);
            (params as any).fee.push(fee);
            (params as any).feeRecipient.push(feeRecipient);
            await feeRecipients.create(feeRecipient, "marketplace", source);
          }
          for (const feeData of params.customRoyalties ?? []) {
            const [feeRecipient, fee] = feeData.split(":");
            (params as any).fee.push(fee);
            (params as any).feeRecipient.push(feeRecipient);
            await feeRecipients.create(feeRecipient, "royalty", source);
          }

          try {
            const WNATIVE = Sdk.Common.Addresses.WNative[config.chainId];
            const BETH = Sdk.Blur.Addresses.Beth[config.chainId];

            // Default currency for Blur is BETH
            if (params.orderKind === "blur" && params.currency === WNATIVE) {
              params.currency = BETH;
            }

            // Check currency
            if (params.orderKind === "blur" && params.currency !== BETH) {
              return errors.push({ message: "Unsupported currency", orderIndex: i });
            } else if (params.orderKind !== "blur" && params.currency === BETH) {
              return errors.push({ message: "Unsupported currency", orderIndex: i });
            }

            // TODO: Always require the unit price
            const totalPrice = params.orderKind.startsWith("seaport")
              ? bn(params.weiPrice)
              : bn(params.weiPrice).mul(params.quantity ?? 1);

            // Check the maker's balance

            const currency = new Sdk.Common.Helpers.Erc20(baseProvider, params.currency);
            const currencyBalance = await currency.getBalance(maker);
            if (bn(currencyBalance).lt(totalPrice)) {
              if ([WNATIVE, BETH].includes(params.currency)) {
                const ethBalance = await baseProvider.getBalance(maker);
                if (bn(currencyBalance).add(ethBalance).lt(totalPrice)) {
                  return errors.push({
                    message: "Maker does not have sufficient balance",
                    orderIndex: i,
                  });
                } else {
                  const wnative = new Sdk.Common.Helpers.WNative(baseProvider, config.chainId);
                  const wrapTx = wnative.depositTransaction(maker, totalPrice.sub(currencyBalance));

                  steps[1].items.push({
                    status: "incomplete",
                    data:
                      params.currency === BETH
                        ? { ...wrapTx, to: BETH }
                        : { ...wrapTx, to: WNATIVE },
                    orderIndexes: [i],
                  });
                }
              } else {
                return errors.push({
                  message: "Maker does not have sufficient balance",
                  orderIndex: i,
                });
              }
            }

            const attribute =
              collectionId && attributeKey && attributeValue
                ? {
                    collection: collectionId,
                    key: attributeKey,
                    value: attributeValue,
                  }
                : undefined;
            const collection =
              collectionId && !attributeKey && !attributeValue ? collectionId : undefined;

            const supportedPermitCurrencies = Sdk.Common.Addresses.Usdc[config.chainId] ?? [];
            if (params.usePermit && !supportedPermitCurrencies.includes(params.currency)) {
              return errors.push({ message: "Permit not supported for currency", orderIndex: i });
            }

            switch (params.orderKind) {
              case "blur": {
                if (!["blur"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }
                if (params.fees?.length) {
                  return errors.push({
                    message: "Custom fees not supported",
                    orderIndex: i,
                  });
                }

                if (!collection) {
                  return errors.push({
                    message: "Only collection bids are supported",
                    orderIndex: i,
                  });
                }

                // TODO: Return an error if the collection is not supported by Blur

                const needsBethWrapping = steps[1].items.find(
                  (i) => i.status === "incomplete" && i.data?.to === BETH
                );
                if (needsBethWrapping) {
                  // Force the client to poll
                  // (since Blur won't release the calldata unless you have enough BETH in your wallet)
                  steps[5].items.push({
                    status: "incomplete",
                  });
                } else {
                  const { signData, marketplaceData } = await blurBuyCollection.build({
                    ...params,
                    maker,
                    contract: collection,
                    authToken: blurAuth!.accessToken,
                  });

                  // Blur returns the nonce as a BigNumber object
                  signData.value.nonce = signData.value.nonce.hex ?? signData.value.nonce;

                  const id = new Sdk.BlurV2.Order(config.chainId, signData.value).hash();

                  steps[5].items.push({
                    status: "incomplete",
                    data: {
                      sign: {
                        signatureKind: "eip712",
                        domain: signData.domain,
                        types: signData.types,
                        value: signData.value,
                        primaryType: _TypedDataEncoder.getPrimaryType(signData.types),
                      },
                      post: {
                        endpoint: "/order/v4",
                        method: "POST",
                        body: {
                          items: [
                            {
                              order: {
                                kind: "blur",
                                data: {
                                  id,
                                  maker,
                                  marketplaceData,
                                  authToken: blurAuth!.accessToken,
                                  isCollectionBid: true,
                                },
                              },
                              collection,
                              orderbook: params.orderbook,
                              orderbookApiKey: params.orderbookApiKey,
                            },
                          ],
                          source,
                        },
                      },
                    },
                    orderIndexes: [i],
                  });

                  addExecution(id, params.quantity);
                }

                break;
              }

              case "seaport-v1.5": {
                if (!["reservoir", "opensea", "looks-rare"].includes(params.orderbook)) {
                  return errors.push({
                    message: "Unsupported orderbook",
                    orderIndex: i,
                  });
                }

                const options = (params.options?.["seaport-v1.4"] ??
                  params.options?.["seaport-v1.5"]) as
                  | {
                      conduitKey?: string;
                      useOffChainCancellation?: boolean;
                      replaceOrderId?: string;
                    }
                  | undefined;

                let order: Sdk.SeaportV15.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await seaportV15BuyToken.build({
                    ...params,
                    ...options,
                    orderbook: params.orderbook as "reservoir" | "opensea",
                    maker,
                    contract,
                    tokenId,
                    source,
                  });
                } else if (tokenSetId) {
                  order = await seaportV15BuyAttribute.build({
                    ...params,
                    ...options,
                    orderbook: params.orderbook as "reservoir" | "opensea",
                    maker,
                    source,
                  });
                } else if (attribute) {
                  order = await seaportV15BuyAttribute.build({
                    ...params,
                    ...options,
                    orderbook: params.orderbook as "reservoir" | "opensea",
                    maker,
                    collection: attribute.collection,
                    attributes: [attribute],
                    source,
                  });
                } else if (collection) {
                  order = await seaportV15BuyCollection.build({
                    ...params,
                    ...options,
                    orderbook: params.orderbook as "reservoir" | "opensea",
                    maker,
                    collection,
                    source,
                  });
                } else {
                  return errors.push({
                    message:
                      "Only token, token-set-id, attribute and collection bids are supported",
                    orderIndex: i,
                  });
                }

                const exchange = new Sdk.SeaportV15.Exchange(config.chainId);
                const conduit = exchange.deriveConduit(order.params.conduitKey);

                const price = order.getMatchingPrice().toString();

                // Check the maker's approval
                let approvalTx: TxData | undefined;
                const currencyApproval = await currency.getAllowance(maker, conduit);
                if (bn(currencyApproval).lt(price)) {
                  approvalTx = currency.approveTransaction(maker, conduit);
                }

                // Use permits
                let permitId: string | undefined;
                let permitIndex: number | undefined;
                if (params.usePermit && approvalTx) {
                  const permitHandler = new PermitHandler(config.chainId, baseProvider);
                  const [permit] = await permitHandler.generate(
                    maker,
                    conduit,
                    {
                      kind: "no-transfers",
                      token: params.currency,
                      amount: MaxUint256.toString(),
                    },
                    order.params.endTime - now()
                  );

                  const id = getEphemeralPermitId(request.payload as object, {
                    owner: permit.data.owner,
                    spender: permit.data.spender,
                    token: permit.data.token,
                    amount: permit.data.amount,
                    nonce: permit.data.nonce,
                    deadline: permit.data.deadline,
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
                  if (!hasSignature) {
                    steps[4].items.push({
                      status: "incomplete",
                      data: {
                        sign: await permitHandler.getSignatureData(permit),
                        post: {
                          endpoint: "/execute/permit-signature/v1",
                          method: "POST",
                          body: {
                            id,
                            persist: true,
                          },
                        },
                      },
                    });
                  } else {
                    permitId = await permitHandler.hash(permit);
                    permitIndex = 0;
                  }
                }

                if (!params.usePermit) {
                  steps[2].items.push({
                    status: !approvalTx ? "complete" : "incomplete",
                    data: approvalTx,
                    orderIndexes: [i],
                  });
                }

                bulkOrders["seaport-v1.5"].push({
                  order: {
                    kind: params.orderKind,
                    data: {
                      ...order.params,
                    },
                  },
                  tokenSetId,
                  attribute,
                  collection,
                  isNonFlagged: params.excludeFlaggedTokens,
                  orderbook: params.orderbook,
                  permitId,
                  permitIndex,
                  orderbookApiKey: params.orderbookApiKey,
                  source,
                  orderIndex: i,
                });

                addExecution(order.hash(), params.quantity);

                break;
              }

              case "alienswap": {
                if (!["reservoir"].includes(params.orderbook)) {
                  return errors.push({
                    message: "Unsupported orderbook",
                    orderIndex: i,
                  });
                }

                const options = params.options?.[params.orderKind] as
                  | {
                      useOffChainCancellation?: boolean;
                      replaceOrderId?: string;
                    }
                  | undefined;

                let order: Sdk.Alienswap.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await alienswapBuyToken.build({
                    ...params,
                    ...options,
                    orderbook: params.orderbook as "reservoir",
                    maker,
                    contract,
                    tokenId,
                    source,
                  });
                } else if (tokenSetId) {
                  order = await alienswapBuyAttribute.build({
                    ...params,
                    ...options,
                    orderbook: params.orderbook as "reservoir",
                    maker,
                    source,
                  });
                } else if (attribute) {
                  order = await alienswapBuyAttribute.build({
                    ...params,
                    ...options,
                    orderbook: params.orderbook as "reservoir",
                    maker,
                    collection: attribute.collection,
                    attributes: [attribute],
                    source,
                  });
                } else if (collection) {
                  order = await alienswapBuyCollection.build({
                    ...params,
                    ...options,
                    orderbook: params.orderbook as "reservoir",
                    maker,
                    collection,
                    source,
                  });
                } else {
                  return errors.push({
                    message:
                      "Only token, token-set-id, attribute and collection bids are supported",
                    orderIndex: i,
                  });
                }

                const exchange = new Sdk.Alienswap.Exchange(config.chainId);
                const conduit = exchange.deriveConduit(order.params.conduitKey);

                // Check the maker's approval
                let approvalTx: TxData | undefined;
                const currencyApproval = await currency.getAllowance(maker, conduit);
                if (bn(currencyApproval).lt(order.getMatchingPrice())) {
                  approvalTx = currency.approveTransaction(maker, conduit);
                }

                steps[2].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
                  data: approvalTx,
                  orderIndexes: [i],
                });

                bulkOrders["alienswap"].push({
                  order: {
                    kind: params.orderKind,
                    data: {
                      ...order.params,
                    },
                  },
                  tokenSetId,
                  attribute,
                  collection,
                  isNonFlagged: params.excludeFlaggedTokens,
                  orderbook: params.orderbook,
                  orderbookApiKey: params.orderbookApiKey,
                  source,
                  orderIndex: i,
                });

                addExecution(order.hash(), params.quantity);

                break;
              }

              case "zeroex-v4" as any: {
                if (!["reservoir"].includes(params.orderbook)) {
                  return errors.push({
                    message: "Unsupported orderbook",
                    orderIndex: i,
                  });
                }

                let order: Sdk.ZeroExV4.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await zeroExV4BuyToken.build({
                    ...params,
                    orderbook: "reservoir",
                    maker,
                    contract,
                    tokenId,
                  });
                } else if (tokenSetId) {
                  order = await zeroExV4BuyAttribute.build({
                    ...params,
                    orderbook: "reservoir",
                    maker,
                  });
                } else if (attribute) {
                  order = await zeroExV4BuyAttribute.build({
                    ...params,
                    orderbook: "reservoir",
                    maker,
                    collection: attribute.collection,
                    attributes: [attribute],
                  });
                } else if (collection) {
                  order = await zeroExV4BuyCollection.build({
                    ...params,
                    orderbook: "reservoir",
                    maker,
                    collection,
                  });
                } else {
                  return errors.push({
                    message:
                      "Only token, token-set-id, attribute and collection bids are supported",
                    orderIndex: i,
                  });
                }

                // Check the maker's approval
                let approvalTx: TxData | undefined;
                const currencyApproval = await currency.getAllowance(
                  maker,
                  Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
                );
                if (
                  bn(currencyApproval).lt(
                    bn(order.params.erc20TokenAmount).add(order.getFeeAmount())
                  )
                ) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
                  );
                }

                steps[2].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
                  data: approvalTx,
                  orderIndexes: [i],
                });

                steps[5].items.push({
                  status: "incomplete",
                  data: {
                    sign: order.getSignatureData(),
                    post: {
                      endpoint: "/order/v3",
                      method: "POST",
                      body: {
                        order: {
                          kind: "zeroex-v4",
                          data: {
                            ...order.params,
                          },
                        },
                        tokenSetId,
                        attribute,
                        collection,
                        isNonFlagged: params.excludeFlaggedTokens,
                        orderbook: params.orderbook,
                        orderbookApiKey: params.orderbookApiKey,
                        source,
                      },
                    },
                  },
                  orderIndexes: [i],
                });

                addExecution(order.hash(), params.quantity);

                break;
              }

              case "looks-rare-v2": {
                if (!["reservoir", "looks-rare"].includes(params.orderbook)) {
                  return errors.push({
                    message: "Unsupported orderbook",
                    orderIndex: i,
                  });
                }
                if (params.fees?.length) {
                  return errors.push({
                    message: "Custom fees not supported",
                    orderIndex: i,
                  });
                }
                if (params.excludeFlaggedTokens) {
                  return errors.push({
                    message: "Flagged tokens exclusion not supported",
                    orderIndex: i,
                  });
                }

                let order: Sdk.LooksRareV2.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await looksRareV2BuyToken.build({
                    ...params,
                    maker,
                    contract,
                    tokenId,
                  });
                } else if (collection) {
                  order = await looksRareV2BuyCollection.build({
                    ...params,
                    maker,
                    collection,
                  });
                } else {
                  return errors.push({
                    message: "Only token and collection bids are supported",
                    orderIndex: i,
                  });
                }

                // Check the maker's approval
                let approvalTx: TxData | undefined;
                const currencyApproval = await currency.getAllowance(
                  maker,
                  Sdk.LooksRareV2.Addresses.Exchange[config.chainId]
                );
                if (bn(currencyApproval).lt(bn(order.params.price))) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.LooksRareV2.Addresses.Exchange[config.chainId]
                  );
                }

                steps[2].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
                  data: approvalTx,
                  orderIndexes: [i],
                });

                steps[5].items.push({
                  status: "incomplete",
                  data: {
                    sign: order.getSignatureData(),
                    post: {
                      endpoint: "/order/v3",
                      method: "POST",
                      body: {
                        order: {
                          kind: "looks-rare-v2",
                          data: {
                            ...order.params,
                          },
                        },
                        tokenSetId,
                        collection,
                        orderbook: params.orderbook,
                        orderbookApiKey: params.orderbookApiKey,
                        source,
                      },
                    },
                  },
                  orderIndexes: [i],
                });

                addExecution(order.hash(), params.quantity);

                break;
              }

              case "x2y2": {
                if (!["x2y2"].includes(params.orderbook)) {
                  return errors.push({
                    message: "Unsupported orderbook",
                    orderIndex: i,
                  });
                }

                if (params.fees?.length) {
                  return errors.push({
                    message: "Custom fees not supported",
                    orderIndex: i,
                  });
                }

                let order: Sdk.X2Y2.Types.LocalOrder;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await x2y2BuyToken.build({
                    ...params,
                    orderbook: "x2y2",
                    maker,
                    contract,
                    tokenId,
                  });
                } else if (collection) {
                  order = await x2y2BuyCollection.build({
                    ...params,
                    orderbook: "x2y2",
                    maker,
                    collection,
                  });
                } else {
                  return errors.push({
                    message: "Only token and collection bids are supported",
                    orderIndex: i,
                  });
                }

                const upstreamOrder = Sdk.X2Y2.Order.fromLocalOrder(config.chainId, order);

                // Check the maker's approval
                let approvalTx: TxData | undefined;
                const currencyApproval = await currency.getAllowance(
                  maker,
                  Sdk.X2Y2.Addresses.Exchange[config.chainId]
                );
                if (bn(currencyApproval).lt(bn(upstreamOrder.params.price))) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.X2Y2.Addresses.Exchange[config.chainId]
                  );
                }

                steps[2].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
                  data: approvalTx,
                  orderIndexes: [i],
                });

                steps[5].items.push({
                  status: "incomplete",
                  data: {
                    sign: new Sdk.X2Y2.Exchange(
                      config.chainId,
                      config.x2y2ApiKey
                    ).getOrderSignatureData(order),
                    post: {
                      endpoint: "/order/v3",
                      method: "POST",
                      body: {
                        order: {
                          kind: "x2y2",
                          data: {
                            ...order,
                          },
                        },
                        tokenSetId,
                        collection,
                        orderbook: params.orderbook,
                        orderbookApiKey: params.orderbookApiKey,
                        source,
                      },
                    },
                  },
                  orderIndexes: [i],
                });

                addExecution(
                  new Sdk.X2Y2.Exchange(config.chainId, "").hash(order),
                  params.quantity
                );

                break;
              }

              case "payment-processor": {
                if (!["reservoir"].includes(params.orderbook)) {
                  return errors.push({
                    message: "Unsupported orderbook",
                    orderIndex: i,
                  });
                }

                let order: Sdk.PaymentProcessor.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await paymentProcessorBuyToken.build({
                    ...params,
                    maker,
                    contract,
                    tokenId,
                  });
                } else if (collection) {
                  order = await paymentProcessorBuyCollection.build({
                    ...params,
                    maker,
                    collection,
                  });
                } else {
                  return errors.push({
                    message: "Only token and collection bids are supported",
                    orderIndex: i,
                  });
                }

                // Check the maker's approval
                let approvalTx: TxData | undefined;
                const currencyApproval = await currency.getAllowance(
                  maker,
                  Sdk.PaymentProcessor.Addresses.Exchange[config.chainId]
                );
                if (bn(currencyApproval).lt(bn(order.params.price))) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.PaymentProcessor.Addresses.Exchange[config.chainId]
                  );
                }

                steps[2].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
                  data: approvalTx,
                  orderIndexes: [i],
                });

                // Handle on-chain authentication
                for (const tv of _.uniq(unverifiedERC721CTransferValidators)) {
                  const erc721cAuthId = e.getAuthId(payload.maker);
                  const erc721cAuth = await e.getAuth(erc721cAuthId);

                  steps[3].items.push({
                    status: "incomplete",
                    data: new Sdk.Common.Helpers.Erc721C().generateVerificationTxData(
                      tv,
                      payload.maker,
                      erc721cAuth!.signature
                    ),
                  });
                }

                steps[5].items.push({
                  status: "incomplete",
                  data: {
                    sign: order.getSignatureData(),
                    post: {
                      endpoint: "/order/v4",
                      method: "POST",
                      body: {
                        items: [
                          {
                            order: {
                              kind: "payment-processor",
                              data: {
                                ...order.params,
                              },
                            },
                            tokenSetId,
                            attribute,
                            collection,
                            isNonFlagged: params.excludeFlaggedTokens,
                            orderbook: params.orderbook,
                            orderbookApiKey: params.orderbookApiKey,
                          },
                        ],
                        source,
                      },
                    },
                  },
                  orderIndexes: [i],
                });

                addExecution(order.hash(), params.quantity);

                break;
              }

              case "payment-processor-v2": {
                if (!["reservoir"].includes(params.orderbook)) {
                  return errors.push({
                    message: "Unsupported orderbook",
                    orderIndex: i,
                  });
                }

                const options = params.options?.[params.orderKind] as
                  | {
                      useOffChainCancellation?: boolean;
                      replaceOrderId?: string;
                      cosigner?: string;
                    }
                  | undefined;

                let order: Sdk.PaymentProcessorV2.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await paymentProcessorV2BuyToken.build({
                    ...params,
                    ...options,
                    maker,
                    contract,
                    tokenId,
                  });
                } else if (attribute) {
                  order = await paymentProcessorV2BuyAttribute.build({
                    ...params,
                    ...options,
                    maker,
                    collection: attribute.collection,
                    attributes: [attribute],
                  });
                } else if (collection) {
                  order = await paymentProcessorV2BuyCollection.build({
                    ...params,
                    ...options,
                    maker,
                    collection,
                  });
                } else {
                  return errors.push({
                    message: "Only token and collection bids are supported",
                    orderIndex: i,
                  });
                }

                // Check the maker's approval
                let approvalTx: TxData | undefined;
                const currencyApproval = await currency.getAllowance(
                  maker,
                  Sdk.PaymentProcessorV2.Addresses.Exchange[config.chainId]
                );
                if (bn(currencyApproval).lt(bn(order.params.itemPrice))) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.PaymentProcessorV2.Addresses.Exchange[config.chainId]
                  );
                }

                steps[2].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
                  data: approvalTx,
                  orderIndexes: [i],
                });

                // Handle on-chain authentication
                for (const tv of _.uniq(unverifiedERC721CTransferValidators)) {
                  const erc721cAuthId = e.getAuthId(payload.maker);
                  const erc721cAuth = await e.getAuth(erc721cAuthId);

                  steps[3].items.push({
                    status: "incomplete",
                    data: new Sdk.Common.Helpers.Erc721C().generateVerificationTxData(
                      tv,
                      payload.maker,
                      erc721cAuth!.signature
                    ),
                  });
                }

                steps[5].items.push({
                  status: "incomplete",
                  data: {
                    sign: order.getSignatureData(),
                    post: {
                      endpoint: "/order/v4",
                      method: "POST",
                      body: {
                        items: [
                          {
                            order: {
                              kind: "payment-processor-v2",
                              data: {
                                ...order.params,
                              },
                            },
                            tokenSetId,
                            attribute,
                            collection,
                            isNonFlagged: params.excludeFlaggedTokens,
                            orderbook: params.orderbook,
                            orderbookApiKey: params.orderbookApiKey,
                          },
                        ],
                        source,
                      },
                    },
                  },
                  orderIndexes: [i],
                });

                addExecution(order.hash(), params.quantity);

                break;
              }
            }
          } catch (error: any) {
            return errors.push({
              message: error.response?.data ? JSON.stringify(error.response.data) : error.message,
              orderIndex: i,
            });
          }
        })
      );

      // Post any seaport-v1.5 bulk orders together
      {
        const orders = bulkOrders["seaport-v1.5"];
        if (orders.length === 1) {
          const order = new Sdk.SeaportV15.Order(config.chainId, orders[0].order.data);
          steps[5].items.push({
            status: "incomplete",
            data: {
              sign: order.getSignatureData(),
              post: {
                endpoint: "/order/v3",
                method: "POST",
                body: {
                  order: {
                    kind: "seaport-v1.5",
                    data: {
                      ...order.params,
                    },
                  },
                  tokenSetId: orders[0].tokenSetId,
                  attribute: orders[0].attribute,
                  collection: orders[0].collection,
                  isNonFlagged: orders[0].isNonFlagged,
                  permitId: orders[0].permitId,
                  permitIndex: orders[0].permitIndex,
                  orderbook: orders[0].orderbook,
                  orderbookApiKey: orders[0].orderbookApiKey,
                  source,
                },
              },
            },
            orderIndexes: [orders[0].orderIndex],
          });
        } else if (orders.length > 1) {
          const exchange = new Sdk.SeaportV15.Exchange(config.chainId);
          const { signatureData, proofs } = exchange.getBulkSignatureDataWithProofs(
            orders.map((o) => new Sdk.SeaportV15.Order(config.chainId, o.order.data))
          );

          steps[5].items.push({
            status: "incomplete",
            data: {
              sign: signatureData,
              post: {
                endpoint: "/order/v4",
                method: "POST",
                body: {
                  items: orders.map((o, i) => ({
                    order: o.order,
                    tokenSetId: o.tokenSetId,
                    attribute: o.attribute,
                    collection: o.collection,
                    isNonFlagged: o.isNonFlagged,
                    permitId: o.permitId,
                    permitIndex: o.permitIndex,
                    orderbook: o.orderbook,
                    orderbookApiKey: o.orderbookApiKey,
                    bulkData: {
                      kind: "seaport-v1.5",
                      data: {
                        orderIndex: i,
                        merkleProof: proofs[i],
                      },
                    },
                  })),
                  source,
                },
              },
            },
            orderIndexes: orders.map(({ orderIndex }) => orderIndex),
          });
        }
      }

      // Post any alienswap bulk orders together
      {
        const orders = bulkOrders["alienswap"];
        if (orders.length === 1) {
          const order = new Sdk.Alienswap.Order(config.chainId, orders[0].order.data);
          steps[5].items.push({
            status: "incomplete",
            data: {
              sign: order.getSignatureData(),
              post: {
                endpoint: "/order/v3",
                method: "POST",
                body: {
                  order: {
                    kind: "alienswap",
                    data: {
                      ...order.params,
                    },
                  },
                  tokenSetId: orders[0].tokenSetId,
                  attribute: orders[0].attribute,
                  collection: orders[0].collection,
                  isNonFlagged: orders[0].isNonFlagged,
                  orderbook: orders[0].orderbook,
                  orderbookApiKey: orders[0].orderbookApiKey,
                  source,
                },
              },
            },
            orderIndexes: [orders[0].orderIndex],
          });
        } else if (orders.length > 1) {
          const exchange = new Sdk.Alienswap.Exchange(config.chainId);
          const { signatureData, proofs } = exchange.getBulkSignatureDataWithProofs(
            orders.map((o) => new Sdk.Alienswap.Order(config.chainId, o.order.data))
          );

          steps[5].items.push({
            status: "incomplete",
            data: {
              sign: signatureData,
              post: {
                endpoint: "/order/v4",
                method: "POST",
                body: {
                  items: orders.map((o, i) => ({
                    order: o.order,
                    tokenSetId: o.tokenSetId,
                    attribute: o.attribute,
                    collection: o.collection,
                    isNonFlagged: o.isNonFlagged,
                    orderbook: o.orderbook,
                    orderbookApiKey: o.orderbookApiKey,
                    bulkData: {
                      kind: "alienswap",
                      data: {
                        orderIndex: i,
                        merkleProof: proofs[i],
                      },
                    },
                  })),
                  source,
                },
              },
            },
            orderIndexes: orders.map(({ orderIndex }) => orderIndex),
          });
        }
      }

      // We should only have a single wrapping transaction per currency
      if (steps[1].items.length > 1) {
        const amounts: { [to: string]: BigNumber } = {};
        for (let i = 0; i < steps[1].items.length; i++) {
          const data = steps[1].items[i].data;
          if (data) {
            const itemAmount = bn(data.value || 0);
            if (!amounts[data.to] || itemAmount.gt(amounts[data.to])) {
              amounts[data.to] = itemAmount;
            }
          }
        }

        steps[1].items = [];
        for (const [to, amount] of Object.entries(amounts)) {
          if (amount.gt(0)) {
            const wnative = new Sdk.Common.Helpers.WNative(baseProvider, config.chainId);
            const wrapTx = wnative.depositTransaction(maker, amount);

            steps[1].items.push({
              status: "incomplete",
              data: {
                ...wrapTx,
                to,
              },
            });
          }
        }
      }

      if (!steps[5].items.length) {
        const error = getExecuteError("No orders can be created");
        error.output.payload.errors = errors;
        throw error;
      }

      // Don't return the last step if there any are permits to be signed
      if (steps[4].items.length) {
        steps[5].items = steps[5].items.map((item) => ({
          ...item,
          status: "incomplete",
          data: undefined,
        }));
      }

      // De-duplicate step items
      for (const step of steps) {
        // Assume `JSON.stringify` is deterministic
        const uniqueItems = _.uniqBy(step.items, ({ data }) => JSON.stringify(data));
        if (step.items.length > uniqueItems.length) {
          step.items = uniqueItems.map((uniqueItem) => ({
            status: uniqueItem.status,
            data: uniqueItem.data,
            orderIndexes: (() => {
              const uniqueData = JSON.stringify(uniqueItem.data);
              const aggregatedOrderIndexes = [];
              for (const { data, orderIndexes } of step.items) {
                if (JSON.stringify(data) === uniqueData) {
                  aggregatedOrderIndexes.push(...(orderIndexes ?? []));
                }
              }
              return aggregatedOrderIndexes;
            })(),
          }));
        }
      }

      // Warning! When filtering the steps, we should ensure that it
      // won't affect the client, which might be polling the API and
      // expect to get the steps returned in the same order / at the
      // same index.
      if (!blurAuth && !unverifiedERC721CTransferValidators.length) {
        // If we reached this point and the Blur auth is missing then we
        // can be sure that no Blur orders were requested and it is safe
        // to remove the auth step - we also handle other authentication
        // methods (eg. ERC721C)
        steps = steps.slice(1);
      }

      await executionsBuffer.flush();

      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);
      logger.info(
        `get-execute-bid-${version}-handler`,
        JSON.stringify({
          request: payload,
          apiKey,
        })
      );

      return { steps, errors };
    } catch (error) {
      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);
      logger.error(
        `get-execute-bid-${version}-handler`,
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
