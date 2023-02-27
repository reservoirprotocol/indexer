/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";
import _ from "lodash";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

// LooksRare
import * as looksRareSellToken from "@/orderbook/orders/looks-rare/build/sell/token";
import * as looksRareCheck from "@/orderbook/orders/looks-rare/check";

// Seaport
import * as seaportSellToken from "@/orderbook/orders/seaport/build/sell/token";
import * as seaportCheck from "@/orderbook/orders/seaport/check";

// Seaport v1.3
import * as seaportV14SellToken from "@/orderbook/orders/seaport-v1.4/build/sell/token";
import * as seaportV14Check from "@/orderbook/orders/seaport-v1.4/check";

// X2Y2
import * as x2y2SellToken from "@/orderbook/orders/x2y2/build/sell/token";
import * as x2y2Check from "@/orderbook/orders/x2y2/check";

// ZeroExV4
import * as zeroExV4SellToken from "@/orderbook/orders/zeroex-v4/build/sell/token";
import * as zeroExV4Check from "@/orderbook/orders/zeroex-v4/check";

// Universe
import * as universeSellToken from "@/orderbook/orders/universe/build/sell/token";
import * as universeCheck from "@/orderbook/orders/universe/check";

// Infinity
import * as infinitySellToken from "@/orderbook/orders/infinity/build/sell/token";
import * as infinityCheck from "@/orderbook/orders/infinity/check";

// Flow
import * as flowSellToken from "@/orderbook/orders/flow/build/sell/token";
import * as flowCheck from "@/orderbook/orders/flow/check";

const version = "v5";

export const getExecuteListV5Options: RouteOptions = {
  description: "Create asks (listings)",
  notes: "Generate listings and submit them to multiple marketplaces",
  tags: ["api", "Orderbook"],
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
              "looks-rare",
              "zeroex-v4",
              "seaport",
              "seaport-v1.4",
              "x2y2",
              "universe",
              "infinity",
              "flow"
            )
            .default("seaport-v1.4")
            .description("Exchange protocol used to create order. Example: `seaport-v1.4`"),
          orderbook: Joi.string()
            .valid("opensea", "looks-rare", "reservoir", "x2y2", "universe", "infinity", "flow")
            .default("reservoir")
            .description("Orderbook where order is placed. Example: `Reservoir`"),
          orderbookApiKey: Joi.string().description("Optional API key for the target orderbook"),
          automatedRoyalties: Joi.boolean()
            .default(true)
            .description("If true, royalties will be automatically included."),
          royaltyBps: Joi.number().description(
            "The royalty percentage to pay. Only relevant when using automated royalties."
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

    try {
      const maker = payload.maker as string;
      const source = payload.source as string | undefined;
      const params = payload.params as {
        token: string;
        quantity?: number;
        weiPrice: string;
        orderKind: string;
        orderbook: string;
        orderbookApiKey?: string;
        automatedRoyalties: boolean;
        royaltyBps?: number;
        fees: string[];
        listingTime?: number;
        expirationTime?: number;
        salt?: string;
        nonce?: string;
        currency?: string;
      }[];

      // Set up generic listing steps
      const steps: {
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
            data: Sdk.SeaportV14.Types.OrderComponents;
          };
          orderbook: string;
          orderbookApiKey?: string;
          source?: string;
          orderIndex: number;
        }[],
      };

      const errors: { message: string; orderIndex: number }[] = [];
      await Promise.all(
        params.map(async (params, i) => {
          const [contract, tokenId] = params.token.split(":");

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

                steps[0].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[1].items.push({
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

              case "infinity": {
                if (!["infinity"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }

                const order = await infinitySellToken.build({
                  ...params,
                  orderbook: "infinity",
                  maker,
                  contract,
                  tokenId,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  await infinityCheck.offChainCheck(order, { onChainApprovalRecheck: true });
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
                      ).approveTransaction(maker, Sdk.Infinity.Addresses.Exchange[config.chainId]);

                      break;
                    }
                  }
                }

                steps[0].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[1].items.push({
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

                steps[0].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[1].items.push({
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
                if (!["reservoir", "opensea"].includes(params.orderbook)) {
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
                try {
                  await seaportCheck.offChainCheck(order, { onChainApprovalRecheck: true });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      // Generate an approval transaction

                      const exchange = new Sdk.Seaport.Exchange(config.chainId);
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

                steps[0].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[1].items.push({
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

                const order = await seaportV14SellToken.build({
                  ...params,
                  orderbook: params.orderbook as "reservoir" | "opensea",
                  maker,
                  contract,
                  tokenId,
                  source,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  await seaportV14Check.offChainCheck(order, { onChainApprovalRecheck: true });
                } catch (error: any) {
                  switch (error.message) {
                    case "no-balance-no-approval":
                    case "no-balance": {
                      return errors.push({ message: "Maker does not own token", orderIndex: i });
                    }

                    case "no-approval": {
                      // Generate an approval transaction

                      const exchange = new Sdk.SeaportV14.Exchange(config.chainId);
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

                steps[0].items.push({
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

              case "looks-rare": {
                if (!["reservoir", "looks-rare"].includes(params.orderbook)) {
                  return errors.push({ message: "Unsupported orderbook", orderIndex: i });
                }
                if (params.fees?.length) {
                  return errors.push({ message: "custom-fees-not-supported", orderIndex: i });
                }

                const order = await looksRareSellToken.build({
                  ...params,
                  maker,
                  contract,
                  tokenId,
                });

                // Will be set if an approval is needed before listing
                let approvalTx: TxData | undefined;

                // Check the order's fillability
                try {
                  await looksRareCheck.offChainCheck(order, { onChainApprovalRecheck: true });
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
                        contractKind === "erc721"
                          ? Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId]
                          : Sdk.LooksRare.Addresses.TransferManagerErc1155[config.chainId]
                      );

                      break;
                    }
                  }
                }

                steps[0].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[1].items.push({
                  status: "incomplete",
                  data: {
                    sign: order.getSignatureData(),
                    post: {
                      endpoint: "/order/v3",
                      method: "POST",
                      body: {
                        order: {
                          kind: "looks-rare",
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
                  return errors.push({ message: "custom-fees-not-supported", orderIndex: i });
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
                  await x2y2Check.offChainCheck(upstreamOrder, {
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

                steps[0].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[1].items.push({
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

                steps[0].items.push({
                  status: approvalTx ? "incomplete" : "complete",
                  data: approvalTx,
                  orderIndexes: [i],
                });
                steps[1].items.push({
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
            return errors.push({ message: error.message ?? "Internal error", orderIndex: i });
          }
        })
      );

      // Post any bulk orders together
      {
        const exchange = new Sdk.SeaportV14.Exchange(config.chainId);

        const orders = bulkOrders["seaport-v1.4"];
        if (orders.length) {
          const { signatureData, proofs } = exchange.getBulkSignatureDataWithProofs(
            orders.map((o) => new Sdk.SeaportV14.Order(config.chainId, o.order.data))
          );

          steps[1].items.push({
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

      if (!steps[1].items.length) {
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

      return { steps, errors };
    } catch (error) {
      if (!(error instanceof Boom.Boom)) {
        logger.error(`get-execute-list-${version}-handler`, `Handler failure: ${error}`);
      }
      throw error;
    }
  },
};
