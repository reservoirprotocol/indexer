/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import axios from "axios";
import Joi from "joi";
import _ from "lodash";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { now, regex } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as b from "@/utils/auth/blur";

// Blur
import * as blurSellToken from "@/orderbook/orders/blur/build/sell/token";
import * as blurCheck from "@/orderbook/orders/blur/check";

// LooksRare
import * as looksRareV2SellToken from "@/orderbook/orders/looks-rare-v2/build/sell/token";
import * as looksRareV2Check from "@/orderbook/orders/looks-rare-v2/check";

// Seaport
import * as seaportSellToken from "@/orderbook/orders/seaport-v1.1/build/sell/token";
import * as seaportCheck from "@/orderbook/orders/seaport-base/check";

// Seaport v1.4
import * as seaportV14SellToken from "@/orderbook/orders/seaport-v1.4/build/sell/token";

// X2Y2
import * as x2y2SellToken from "@/orderbook/orders/x2y2/build/sell/token";
import * as x2y2Check from "@/orderbook/orders/x2y2/check";

// ZeroExV4
import * as zeroExV4SellToken from "@/orderbook/orders/zeroex-v4/build/sell/token";
import * as zeroExV4Check from "@/orderbook/orders/zeroex-v4/check";

// Universe
import * as universeSellToken from "@/orderbook/orders/universe/build/sell/token";
import * as universeCheck from "@/orderbook/orders/universe/check";

// Flow
import * as flowSellToken from "@/orderbook/orders/flow/build/sell/token";
import * as flowCheck from "@/orderbook/orders/flow/check";

const version = "v5";

export const getExecuteListV5Options: RouteOptions = {
  description: "Create asks (listings)",
  notes: "Generate listings and submit them to multiple marketplaces",
  tags: ["api", "Create Orders (list & bid)"],
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
      params: Joi.array().items(
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
              "Amount seller is willing to sell for in wei. Example: `1000000000000000000`"
            ),
          orderKind: Joi.string()
            .valid(
              "blur",
              "looks-rare-v2",
              "zeroex-v4",
              "seaport",
              "seaport-v1.4",
              "x2y2",
              "universe",
              "flow"
            )
            .default("seaport-v1.4")
            .description("Exchange protocol used to create order. Example: `seaport-v1.4`"),
          options: Joi.object({
            "seaport-v1.4": Joi.object({
              useOffChainCancellation: Joi.boolean().required(),
              replaceOrderId: Joi.string().when("useOffChainCancellation", {
                is: true,
                then: Joi.optional(),
                otherwise: Joi.forbidden(),
              }),
            }),
          }).description("Additional options."),
          orderbook: Joi.string()
            .valid("blur", "opensea", "looks-rare", "reservoir", "x2y2", "universe", "flow")
            .default("reservoir")
            .description("Orderbook where order is placed. Example: `Reservoir`"),
          orderbookApiKey: Joi.string().description("Optional API key for the target orderbook"),
          automatedRoyalties: Joi.boolean()
            .default(true)
            .description("If true, royalty amounts and recipients will be set automatically."),
          royaltyBps: Joi.number().description(
            "Set a maximum amount of royalties to pay, rather than the full amount. Only relevant when using automated royalties. Note: OpenSea does not support values below 50 bps."
          ),
          fees: Joi.array()
            .items(Joi.string().pattern(regex.fee))
            .description(
              "List of fees (formatted as `feeRecipient:feeBps`) to be bundled within the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00:100`"
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
            .default(Sdk.Common.Addresses.Eth[config.chainId]),
        })
      ),
    }),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          id: Joi.string().required(),
          kind: Joi.string().valid("request", "signature", "transaction").required(),
          action: Joi.string().required(),
          description: Joi.string().required(),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string().valid("complete", "incomplete").required(),
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

    const maker = payload.maker as string;
    const source = payload.source as string | undefined;
    const params = payload.params as {
      token: string;
      quantity?: number;
      weiPrice: string;
      orderKind: string;
      orderbook: string;
      fees: string[];
      options?: any;
      orderbookApiKey?: string;
      automatedRoyalties: boolean;
      royaltyBps?: number;
      listingTime?: number;
      expirationTime?: number;
      salt?: string;
      nonce?: string;
      currency?: string;
    }[];

    const perfTime1 = performance.now();

    try {
      // Set up generic listing steps
      let steps: {
        id: string;
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
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

      // Keep track of orders which can be signed in bulk
      const bulkOrders = {
        "seaport-v1.4": [] as {
          order: {
            kind: "seaport-v1.4";
            data: Sdk.SeaportBase.Types.OrderComponents;
          };
          orderbook: string;
          orderbookApiKey?: string;
          source?: string;
          orderIndex: number;
        }[],
      };

      // Handle Blur authentication
      let blurAuth: string | undefined;
      if (params.some((p) => p.orderKind === "blur")) {
        const blurAuthId = b.getAuthId(maker);

        blurAuth = await b
          .getAuth(blurAuthId)
          .then((auth) => (auth ? auth.accessToken : undefined));
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

      const errors: { message: string; orderIndex: number }[] = [];
      await Promise.all(
        params.map(async (params, i) => {
          const [contract, tokenId] = params.token.split(":");

          // Force usage of seaport-v1.4
          if (params.orderKind === "seaport") {
            params.orderKind = "seaport-v1.4";
          }

          // For now, ERC20 listings are only supported on Seaport
          if (
            params.orderKind !== "seaport" &&
            params.orderKind !== "seaport-v1.4" &&
            params.currency !== Sdk.Common.Addresses.Eth[config.chainId]
          ) {
            return errors.push({ message: "Unsupported currency", orderIndex: i });
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

          try {
            switch (params.orderKind) {
              case "blur": {
                if (!["blur"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                const { order, marketplaceData } = await blurSellToken.build({
                  ...params,
                  maker,
                  contract,
                  tokenId,
                  authToken: blurAuth!,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  await blurCheck.offChainCheck(order, undefined, { onChainApprovalRecheck: true });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      // Generate an approval transaction
                      approvalTx = new Sdk.Common.Helpers.Erc721(
                        baseProvider,
                        order.params.collection
                      ).approveTransaction(
                        maker,
                        Sdk.Blur.Addresses.ExecutionDelegate[config.chainId]
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
                              kind: "blur",
                              data: {
                                id: order.hash(),
                                maker,
                                marketplaceData,
                                authToken: blurAuth!,
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

                break;
              }

              case "zeroex-v4": {
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

                break;
              }

              case "flow": {
                if (!["flow"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                const order = await flowSellToken.build({
                  ...params,
                  orderbook: "flow",
                  maker,
                  contract,
                  tokenId,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  await flowCheck.offChainCheck(order, { onChainApprovalRecheck: true });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      // Generate an approval transaction
                      approvalTx = new Sdk.Common.Helpers.Erc721(
                        baseProvider,
                        contract
                      ).approveTransaction(maker, Sdk.Flow.Addresses.Exchange[config.chainId]);

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
                          kind: params.orderKind,
                          data: {
                            ...order.params,
                          },
                        },
                        orderbook: params.orderbook,
                        source,
                      },
                    },
                  },
                  orderIndexes: [i],
                });

                break;
              }

              case "seaport": {
                if (!["reservoir"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                const order = await seaportSellToken.build({
                  ...params,
                  orderbook: params.orderbook as "opensea" | "reservoir",
                  maker,
                  contract,
                  tokenId,
                  source,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                const exchange = new Sdk.SeaportV11.Exchange(config.chainId);
                try {
                  await seaportCheck.offChainCheck(order, exchange, {
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
                steps[2].items.push({
                  status: "incomplete",
                  data: {
                    sign: order.getSignatureData(),
                    post: {
                      endpoint: "/order/v3",
                      method: "POST",
                      body: {
                        order: {
                          kind: params.orderKind,
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

                break;
              }

              case "seaport-v1.4": {
                if (!["reservoir", "opensea"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                // OpenSea expects a royalty of at least 0.5%
                if (
                  params.orderbook === "opensea" &&
                  params.royaltyBps !== undefined &&
                  Number(params.royaltyBps) < 50
                ) {
                  throw Boom.badRequest(
                    "Royalties should be at least 0.5% when posting to OpenSea"
                  );
                }

                const options = params.options?.[params.orderKind] as
                  | {
                      useOffChainCancellation?: boolean;
                      replaceOrderId?: string;
                    }
                  | undefined;

                const order = await seaportV14SellToken.build({
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
                const exchange = new Sdk.SeaportV14.Exchange(config.chainId);
                try {
                  await seaportCheck.offChainCheck(order, exchange, {
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

                bulkOrders["seaport-v1.4"].push({
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
                      approvalTx = new Sdk.Common.Helpers.Erc721(
                        baseProvider,
                        upstreamOrder.params.nft.token
                      ).approveTransaction(
                        maker,
                        Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId]
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

                break;
              }

              case "universe": {
                if (!["universe"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                const order = await universeSellToken.build({
                  ...params,
                  maker,
                  contract,
                  tokenId,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  await universeCheck.offChainCheck(order, { onChainApprovalRecheck: true });
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
                          ? new Sdk.Common.Helpers.Erc721(
                              baseProvider,
                              order.params.make.assetType.contract!
                            )
                          : new Sdk.Common.Helpers.Erc1155(
                              baseProvider,
                              order.params.make.assetType.contract!
                            )
                      ).approveTransaction(maker, Sdk.Universe.Addresses.Exchange[config.chainId]);

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
                          kind: "universe",
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

      // Post any bulk orders together
      {
        const exchange = new Sdk.SeaportV14.Exchange(config.chainId);

        const orders = bulkOrders["seaport-v1.4"];
        if (orders.length === 1) {
          const order = new Sdk.SeaportV14.Order(config.chainId, orders[0].order.data);
          steps[2].items.push({
            status: "incomplete",
            data: {
              sign: order.getSignatureData(),
              post: {
                endpoint: "/order/v3",
                method: "POST",
                body: {
                  order: {
                    kind: "seaport-v1.4",
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
          const { signatureData, proofs } = exchange.getBulkSignatureDataWithProofs(
            orders.map((o) => new Sdk.SeaportV14.Order(config.chainId, o.order.data))
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
                      kind: "seaport-v1.4",
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
        const error = Boom.badRequest("No tokens can be listed");
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

      return {
        steps: blurAuth ? [steps[0], ...steps.slice(1).filter((s) => s.items.length)] : steps,
        errors,
      };
    } catch (error) {
      if (!(error instanceof Boom.Boom)) {
        logger.error(`get-execute-list-${version}-handler`, `Handler failure: ${error}`);
      }
      throw error;
    }
  },
};
