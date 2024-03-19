/* eslint-disable @typescript-eslint/no-explicit-any */

import { _TypedDataEncoder } from "@ethersproject/hash";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import axios from "axios";
import { randomUUID } from "crypto";
import Joi from "joi";
import _ from "lodash";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { now, regex, bn } from "@/common/utils";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";
import { FeeRecipients } from "@/models/fee-recipients";
import { Sources } from "@/models/sources";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import { getExecuteError } from "@/orderbook/orders/errors";
import { OrderKind, checkBlacklistAndFallback } from "@/orderbook/orders";
import * as b from "@/utils/auth/blur";
import { ExecutionsBuffer } from "@/utils/executions";
import { checkAddressIsBlockedByOFAC } from "@/utils/ofac";

// Blur
import * as blurSellToken from "@/orderbook/orders/blur/build/sell/token";

// LooksRare
import * as looksRareV2SellToken from "@/orderbook/orders/looks-rare-v2/build/sell/token";
import * as looksRareV2Check from "@/orderbook/orders/looks-rare-v2/check";

// Seaport v1.5
import * as seaportBaseCheck from "@/orderbook/orders/seaport-base/check";
import * as seaportV15SellToken from "@/orderbook/orders/seaport-v1.5/build/sell/token";

// Alienswap
import * as alienswapSellToken from "@/orderbook/orders/alienswap/build/sell/token";

// X2Y2
import * as x2y2SellToken from "@/orderbook/orders/x2y2/build/sell/token";
import * as x2y2Check from "@/orderbook/orders/x2y2/check";

// ZeroExV4
import * as zeroExV4SellToken from "@/orderbook/orders/zeroex-v4/build/sell/token";
import * as zeroExV4Check from "@/orderbook/orders/zeroex-v4/check";

// PaymentProcessor
import * as paymentProcessorSellToken from "@/orderbook/orders/payment-processor/build/sell/token";
import * as paymentProcessorCheck from "@/orderbook/orders/payment-processor/check";

// PaymentProcessorV2
import * as paymentProcessorV2SellToken from "@/orderbook/orders/payment-processor-v2/build/sell/token";
import * as paymentProcessorV2Check from "@/orderbook/orders/payment-processor-v2/check";

// PaymentProcessorV2.0.1
import * as paymentProcessorV201SellToken from "@/orderbook/orders/payment-processor-v2.0.1/build/sell/token";
import * as paymentProcessorV201Check from "@/orderbook/orders/payment-processor-base/check";

const version = "v5";

export const getExecuteListV5Options: RouteOptions = {
  description: "Create Listings",
  notes:
    "Generate listings and submit them to multiple marketplaces.\n\n Notes:\n\n- Please use the `/cross-posting-orders/v1` to check the status on cross posted bids.\n\n- We recommend using Reservoir SDK as it abstracts the process of iterating through steps, and returning callbacks that can be used to update your UI.",
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
        .required()
        .description(
          "Address of wallet making the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
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
              .required()
              .description(
                "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
              ),
            quantity: Joi.number().description(
              "Quantity of tokens user is listing. Only compatible with ERC1155 tokens. Example: `5`"
            ),
            weiPrice: Joi.string()
              .pattern(regex.number)
              .required()
              .description(
                "Amount seller is willing to sell for in the smallest denomination for the specific currency. Example: `1000000000000000000`"
              ),
            endWeiPrice: Joi.string()
              .pattern(regex.number)
              .optional()
              .description(
                "Amount seller is willing to sell for Dutch auction in the largest denomination for the specific currency. Example: `2000000000000000000`"
              ),
            orderKind: Joi.string()
              .valid(
                "blur",
                "looks-rare",
                "looks-rare-v2",
                "zeroex-v4",
                "seaport",
                "seaport-v1.4",
                "seaport-v1.5",
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
              alienswap: Joi.object({
                useOffChainCancellation: Joi.boolean().required(),
                replaceOrderId: Joi.string().when("useOffChainCancellation", {
                  is: true,
                  then: Joi.optional(),
                  otherwise: Joi.forbidden(),
                }),
              }),
            }).description("Additional options."),
            orderbook: Joi.string()
              .valid("blur", "opensea", "looks-rare", "reservoir", "x2y2")
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
              .default(Sdk.Common.Addresses.Native[config.chainId]),
            taker: Joi.string()
              .lowercase()
              .pattern(regex.address)
              .description(
                "Address of wallet taking the private order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
              )
              .optional(),
          })
        )
        .min(1),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required().description("Returns `nft-approval` or `order-signature`"),
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
                  .description("Returns `complete` or `incomplete`."),
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
    }).label(`getExecuteList${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-list-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    const executionsBuffer = new ExecutionsBuffer();
    const addExecution = (orderId: string, quantity?: number) =>
      executionsBuffer.addFromRequest(request, {
        side: "sell",
        action: "create",
        user: payload.maker,
        orderId,
        quantity: quantity ?? 1,
      });

    const maker = payload.maker as string;
    const source = payload.source as string | undefined;
    const params = payload.params as {
      token: string;
      quantity?: number;
      weiPrice: string;
      endWeiPrice?: string;
      orderKind: OrderKind;
      orderbook: string;
      fees?: string[];
      marketplaceFees?: string[];
      marketplaceFlatFees?: string[];
      customRoyalties?: string[];
      options?: any;
      orderbookApiKey?: string;
      automatedRoyalties: boolean;
      royaltyBps?: number;
      listingTime?: number;
      expirationTime?: number;
      salt?: string;
      nonce?: string;
      currency?: string;
      taker?: string;
    }[];

    const perfTime1 = performance.now();

    // Source restrictions
    if (source) {
      const sources = await Sources.getInstance();
      const sourceObject = sources.getByDomain(source);
      if (sourceObject && sourceObject.metadata?.allowedApiKeys?.length) {
        const key = request.headers["x-api-key"];
        const apiKey = await ApiKeyManager.getApiKey(key);
        if (!apiKey || !sourceObject.metadata.allowedApiKeys.includes(apiKey.key)) {
          throw Boom.unauthorized("Restricted source");
        }
      }
    }

    // OFAC blocklist
    if (await checkAddressIsBlockedByOFAC(maker)) {
      throw Boom.unauthorized("Address is blocked by OFAC");
    }

    try {
      // Set up generic listing steps
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
          description: "Before being able to list, it might be needed to sign an auth challenge",
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
          id: "order-signature",
          action: "Authorize listing",
          description: "A free off-chain signature to create the listing",
          kind: "signature",
          items: [],
        },
      ];

      const bulkOrders = {
        "seaport-v1.5": [] as {
          order: {
            kind: "seaport-v1.5";
            data: Sdk.SeaportBase.Types.OrderComponents;
          };
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
          }
        }
      }

      const feeRecipients = await FeeRecipients.getInstance();

      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);

      const errors: { message: string; orderIndex: number }[] = [];
      await Promise.all(
        params.map(async (params, i) => {
          const [contract, tokenId] = params.token.split(":");

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

          try {
            // Blacklist checks
            await checkBlacklistAndFallback(contract, params);
          } catch (error) {
            return errors.push({ message: (error as any).message, orderIndex: i });
          }

          // PPv2 restrictions
          try {
            if (params.orderKind === "payment-processor-v2" && process.env.PP_V2_ALLOWED_KEYS) {
              const ppv2AllowedKeys = JSON.parse(process.env.PP_V2_ALLOWED_KEYS) as string[];
              if (!apiKey || !ppv2AllowedKeys.includes(apiKey.key)) {
                return errors.push({
                  message:
                    "Unable to create Payment Processor order. Please change orderKind or contact Reservoir team for access.",
                  orderIndex: i,
                });
              }
            }
          } catch {
            // Skip errors
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

          if (params.taker && !["seaport-v1.5", "x2y2"].includes(params.orderKind)) {
            return errors.push({
              message: "Private orders are only supported for seaport-v1.5 and x2y2",
              orderIndex: i,
            });
          }

          try {
            switch (params.orderKind) {
              case "blur": {
                if (!["blur"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }
                if (params.fees?.length) {
                  return errors.push({ message: "Custom fees not supported", orderIndex: i });
                }

                const { marketplaceData, signData } = await blurSellToken.build({
                  ...params,
                  maker,
                  contract,
                  tokenId,
                  authToken: blurAuth!.accessToken,
                });

                let id: string;
                let approvalTx: TxData | undefined;

                // Blur uses Seaport in case the Blur contracts are blocked
                if (signData.value.conduitKey) {
                  // Will be set if an approval is needed before listing
                  approvalTx = (await commonHelpers.getNftApproval(
                    contract,
                    maker,
                    new Sdk.SeaportBase.ConduitController(config.chainId).deriveConduit(
                      signData.value.conduitKey
                    )
                  ))
                    ? undefined
                    : new Sdk.Common.Helpers.Erc721(baseProvider, contract).approveTransaction(
                        maker,
                        new Sdk.SeaportBase.ConduitController(config.chainId).deriveConduit(
                          signData.value.conduitKey
                        )
                      );

                  id = new Sdk.SeaportV15.Order(config.chainId, signData.value).hash();
                } else {
                  // Will be set if an approval is needed before listing
                  approvalTx = (await commonHelpers.getNftApproval(
                    contract,
                    maker,
                    Sdk.BlurV2.Addresses.Delegate[config.chainId]
                  ))
                    ? undefined
                    : new Sdk.Common.Helpers.Erc721(baseProvider, contract).approveTransaction(
                        maker,
                        Sdk.BlurV2.Addresses.Delegate[config.chainId]
                      );

                  // Blur returns the nonce as a BigNumber object
                  signData.value.nonce = signData.value.nonce.hex ?? signData.value.nonce;

                  id = new Sdk.BlurV2.Order(config.chainId, signData.value).hash();
                }

                steps[1].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[2].items.push({
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
                              },
                            },
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

                break;
              }

              case "zeroex-v4" as any: {
                if (!["reservoir"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                const order = await zeroExV4SellToken.build({
                  ...params,
                  orderbook: "reservoir",
                  maker,
                  contract,
                  tokenId,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  await zeroExV4Check.offChainCheck(order, { onChainApprovalRecheck: true });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      // Generate an approval transaction
                      const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";
                      approvalTx = (
                        kind === "erc721"
                          ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.nft)
                          : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.nft)
                      ).approveTransaction(maker, Sdk.ZeroExV4.Addresses.Exchange[config.chainId]);

                      break;
                    }
                  }
                }

                steps[1].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[2].items.push({
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

              case "seaport-v1.5": {
                if (!["reservoir", "opensea", "looks-rare"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                const options = (params.options?.["seaport-v1.4"] ??
                  params.options?.["seaport-v1.5"]) as
                  | {
                      conduitKey?: string;
                      useOffChainCancellation?: boolean;
                      replaceOrderId?: string;
                    }
                  | undefined;

                const order = await seaportV15SellToken.build({
                  ...params,
                  ...options,
                  orderbook: params.orderbook as "reservoir" | "opensea",
                  maker,
                  contract,
                  tokenId,
                  source,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                const exchange = new Sdk.SeaportV15.Exchange(config.chainId);
                try {
                  await seaportBaseCheck.offChainCheck(order, "seaport-v1.5", exchange, {
                    onChainApprovalRecheck: true,
                  });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      // Generate an approval transaction
                      const info = order.getInfo()!;

                      const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";
                      approvalTx = (
                        kind === "erc721"
                          ? new Sdk.Common.Helpers.Erc721(baseProvider, info.contract)
                          : new Sdk.Common.Helpers.Erc1155(baseProvider, info.contract)
                      ).approveTransaction(maker, exchange.deriveConduit(order.params.conduitKey));

                      break;
                    }
                  }
                }

                steps[1].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });

                bulkOrders["seaport-v1.5"].push({
                  order: {
                    kind: params.orderKind,
                    data: {
                      ...order.params,
                    },
                  },
                  orderbook: params.orderbook,
                  orderbookApiKey: params.orderbookApiKey,
                  source,
                  orderIndex: i,
                });

                addExecution(order.hash(), params.quantity);

                break;
              }

              case "alienswap": {
                if (!["reservoir"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                const options = params.options?.[params.orderKind] as
                  | {
                      useOffChainCancellation?: boolean;
                      replaceOrderId?: string;
                    }
                  | undefined;

                const order = await alienswapSellToken.build({
                  ...params,
                  ...options,
                  orderbook: params.orderbook as "reservoir" | "opensea",
                  maker,
                  contract,
                  tokenId,
                  source,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                const exchange = new Sdk.Alienswap.Exchange(config.chainId);
                try {
                  await seaportBaseCheck.offChainCheck(order, "alienswap", exchange, {
                    onChainApprovalRecheck: true,
                  });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      // Generate an approval transaction
                      const info = order.getInfo()!;

                      const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";
                      approvalTx = (
                        kind === "erc721"
                          ? new Sdk.Common.Helpers.Erc721(baseProvider, info.contract)
                          : new Sdk.Common.Helpers.Erc1155(baseProvider, info.contract)
                      ).approveTransaction(maker, exchange.deriveConduit(order.params.conduitKey));

                      break;
                    }
                  }
                }

                steps[1].items.push({
                  status: approvalTx ? "incomplete" : "complete",
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
                  orderbook: params.orderbook,
                  orderbookApiKey: params.orderbookApiKey,
                  source,
                  orderIndex: i,
                });

                addExecution(order.hash(), params.quantity);

                break;
              }

              case "looks-rare-v2": {
                if (!["reservoir", "looks-rare"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }
                if (params.fees?.length) {
                  return errors.push({ message: "Custom fees not supported", orderIndex: i });
                }

                const order = await looksRareV2SellToken.build({
                  ...params,
                  maker,
                  contract,
                  tokenId,
                });

                const exchange = new Sdk.LooksRareV2.Exchange(config.chainId);
                const granted = await exchange.isGranted(order, baseProvider);
                if (!granted) {
                  const grantApprovalsTx = exchange.grantApprovalsTx(order.params.signer, [
                    exchange.contract.address,
                  ]);
                  steps[1].items.push({
                    status: "incomplete",
                    data: grantApprovalsTx,
                    orderIndexes: [i],
                  });
                }

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  await looksRareV2Check.offChainCheck(order, { onChainApprovalRecheck: true });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      const contractKind = await commonHelpers.getContractKind(contract);
                      if (!contractKind) {
                        return errors.push({ message: "Unsupported contract", orderIndex: i });
                      }

                      // Generate an approval transaction
                      approvalTx = (
                        contractKind === "erc721"
                          ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.collection)
                          : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.collection)
                      ).approveTransaction(
                        maker,
                        Sdk.LooksRareV2.Addresses.TransferManager[config.chainId]
                      );

                      break;
                    }
                  }
                }

                steps[1].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[2].items.push({
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
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }
                if (params.fees?.length) {
                  return errors.push({ message: "Custom fees not supported", orderIndex: i });
                }

                const order = await x2y2SellToken.build({
                  ...params,
                  orderbook: "x2y2",
                  maker,
                  contract,
                  tokenId,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                const upstreamOrder = Sdk.X2Y2.Order.fromLocalOrder(config.chainId, order);
                try {
                  await x2y2Check.offChainCheck(upstreamOrder, undefined, {
                    onChainApprovalRecheck: true,
                  });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      const contractKind = await commonHelpers.getContractKind(contract);
                      if (!contractKind) {
                        return errors.push({ message: "Unsupported contract", orderIndex: i });
                      }

                      // Generate an approval transaction
                      const operator =
                        upstreamOrder.params.delegateType === Sdk.X2Y2.Types.DelegationType.ERC721
                          ? Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId]
                          : Sdk.X2Y2.Addresses.Erc1155Delegate[config.chainId];
                      approvalTx = (
                        upstreamOrder.params.delegateType === Sdk.X2Y2.Types.DelegationType.ERC721
                          ? new Sdk.Common.Helpers.Erc721(
                              baseProvider,
                              upstreamOrder.params.nft.token
                            )
                          : new Sdk.Common.Helpers.Erc1155(
                              baseProvider,
                              upstreamOrder.params.nft.token
                            )
                      ).approveTransaction(maker, operator);

                      break;
                    }
                  }
                }

                steps[1].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[2].items.push({
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
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                if (params.fees && params.fees?.length > 1) {
                  return errors.push({ message: "Multiple fees not supported", orderIndex: i });
                }

                const order = await paymentProcessorSellToken.build({
                  ...params,
                  maker,
                  contract,
                  tokenId,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  await paymentProcessorCheck.offChainCheck(order, {
                    onChainApprovalRecheck: true,
                  });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      // Generate an approval transaction
                      const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";
                      approvalTx = (
                        kind === "erc721"
                          ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.tokenAddress)
                          : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.tokenAddress)
                      ).approveTransaction(
                        maker,
                        Sdk.PaymentProcessor.Addresses.Exchange[config.chainId]
                      );

                      break;
                    }
                  }
                }

                steps[1].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[2].items.push({
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
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                if (params.fees && params.fees?.length > 1) {
                  return errors.push({ message: "Multiple fees not supported", orderIndex: i });
                }

                const options = (params.options?.["payment-processor-v2"] ??
                  params.options?.["payment-processor-v2"]) as
                  | {
                      useOffChainCancellation?: boolean;
                      replaceOrderId?: string;
                      cosigner?: string;
                    }
                  | undefined;

                const order = await paymentProcessorV2SellToken.build({
                  ...params,
                  ...options,
                  maker,
                  contract,
                  tokenId,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  await paymentProcessorV2Check.offChainCheck(order, {
                    onChainApprovalRecheck: true,
                  });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      // Generate an approval transaction
                      const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";
                      approvalTx = (
                        kind === "erc721"
                          ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.tokenAddress)
                          : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.tokenAddress)
                      ).approveTransaction(
                        maker,
                        Sdk.PaymentProcessorV2.Addresses.Exchange[config.chainId]
                      );

                      break;
                    }
                  }
                }

                steps[1].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[2].items.push({
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

              case "payment-processor-v2.0.1": {
                if (!["reservoir"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                if (params.fees && params.fees?.length > 1) {
                  return errors.push({ message: "Multiple fees not supported", orderIndex: i });
                }

                const options = (params.options?.["payment-processor-v2.0.1"] ??
                  params.options?.["payment-processor-v2.0.1"]) as
                  | {
                      useOffChainCancellation?: boolean;
                      replaceOrderId?: string;
                      cosigner?: string;
                    }
                  | undefined;

                const order = await paymentProcessorV201SellToken.build({
                  ...params,
                  ...options,
                  maker,
                  contract,
                  tokenId,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  const exchange = new Sdk.PaymentProcessorV201.Exchange(config.chainId);
                  await paymentProcessorV201Check.offChainCheck(
                    order,
                    "payment-processor-v2.0.1",
                    exchange,
                    {
                      onChainApprovalRecheck: true,
                    }
                  );
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      // Generate an approval transaction
                      const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";
                      approvalTx = (
                        kind === "erc721"
                          ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.tokenAddress)
                          : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.tokenAddress)
                      ).approveTransaction(
                        maker,
                        Sdk.PaymentProcessorV201.Addresses.Exchange[config.chainId]
                      );

                      break;
                    }
                  }
                }

                steps[1].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[2].items.push({
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
                              kind: "payment-processor-v2.0.1",
                              data: {
                                ...order.params,
                              },
                            },
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
          steps[2].items.push({
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

          steps[2].items.push({
            status: "incomplete",
            data: {
              sign: signatureData,
              post: {
                endpoint: "/order/v4",
                method: "POST",
                body: {
                  items: orders.map((o, i) => ({
                    order: o.order,
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
          steps[2].items.push({
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

          steps[2].items.push({
            status: "incomplete",
            data: {
              sign: signatureData,
              post: {
                endpoint: "/order/v4",
                method: "POST",
                body: {
                  items: orders.map((o, i) => ({
                    order: o.order,
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

      if (!steps[2].items.length) {
        const error = getExecuteError("No orders can be created");
        error.output.payload.errors = errors;
        throw error;
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
      if (!blurAuth) {
        // If we reached this point and the Blur auth is missing then we
        // can be sure that no Blur orders were requested and it is safe
        // to remove the auth step
        steps = steps.slice(1);
      }

      await executionsBuffer.flush();

      const perfTime2 = performance.now();

      logger.info(
        "execute-list-v5-performance",
        JSON.stringify({
          kind: "total-performance",
          totalTime: (perfTime2 - perfTime1) / 1000,
          items: params.map((p) => ({
            orderKind: p.orderKind,
            orderbook: p.orderbook,
          })),
          itemsCount: params.length,
        })
      );

      logger.info(
        `get-execute-list-${version}-handler`,
        JSON.stringify({
          request: payload,
          apiKey,
        })
      );

      return {
        steps: blurAuth ? [steps[0], ...steps.slice(1).filter((s) => s.items.length)] : steps,
        errors,
      };
    } catch (error) {
      const key = request.headers["x-api-key"];
      const apiKey = await ApiKeyManager.getApiKey(key);
      logger.error(
        `get-execute-list-${version}-handler`,
        JSON.stringify({
          request: payload,
          uuid: randomUUID(),
          httpCode: error instanceof Boom.Boom ? error.output.statusCode : 500,
          error:
            error instanceof Boom.Boom ? error.output.payload : { error: "Internal Server Error" },
          stack: (error as any).stack,
          apiKey,
        })
      );

      throw error;
    }
  },
};
