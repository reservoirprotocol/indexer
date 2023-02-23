/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";
import _ from "lodash";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, regex } from "@/common/utils";
import { config } from "@/config/index";

// LooksRare
import * as looksRareBuyToken from "@/orderbook/orders/looks-rare/build/buy/token";
import * as looksRareBuyCollection from "@/orderbook/orders/looks-rare/build/buy/collection";

// Seaport
import * as seaportBuyAttribute from "@/orderbook/orders/seaport/build/buy/attribute";
import * as seaportBuyToken from "@/orderbook/orders/seaport/build/buy/token";
import * as seaportBuyCollection from "@/orderbook/orders/seaport/build/buy/collection";

// Seaport v1.3
import * as seaportV14BuyAttribute from "@/orderbook/orders/seaport-v1.4/build/buy/attribute";
import * as seaportV14BuyToken from "@/orderbook/orders/seaport-v1.4/build/buy/token";
import * as seaportV14BuyCollection from "@/orderbook/orders/seaport-v1.4/build/buy/collection";

// X2Y2
import * as x2y2BuyCollection from "@/orderbook/orders/x2y2/build/buy/collection";
import * as x2y2BuyToken from "@/orderbook/orders/x2y2/build/buy/token";

// ZeroExV4
import * as zeroExV4BuyAttribute from "@/orderbook/orders/zeroex-v4/build/buy/attribute";
import * as zeroExV4BuyToken from "@/orderbook/orders/zeroex-v4/build/buy/token";
import * as zeroExV4BuyCollection from "@/orderbook/orders/zeroex-v4/build/buy/collection";

// Universe
import * as universeBuyToken from "@/orderbook/orders/universe/build/buy/token";

// Infinity
import * as infinityBuyToken from "@/orderbook/orders/infinity/build/buy/token";
import * as infinityBuyCollection from "@/orderbook/orders/infinity/build/buy/collection";

// Flow
import * as flowBuyToken from "@/orderbook/orders/flow/build/buy/token";
import * as flowBuyCollection from "@/orderbook/orders/flow/build/buy/collection";

const version = "v5";

export const getExecuteBidV5Options: RouteOptions = {
  description: "Create bids (offers)",
  notes: "Generate bids and submit them to multiple marketplaces",
  timeout: { server: 60000 },
  tags: ["api", "x-experimental"],
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
      params: Joi.array().items(
        Joi.object({
          token: Joi.string()
            .lowercase()
            .pattern(regex.token)
            .description(
              "Bid on a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
            ),
          tokenSetId: Joi.string().lowercase().description("Bid on a particular token set."),
          collection: Joi.string()
            .lowercase()
            .description(
              "Bid on a particular collection with collection-id. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
            ),
          attributeKey: Joi.string().description(
            "Bid on a particular attribute key. Example: `Composition`"
          ),
          attributeValue: Joi.string().description(
            "Bid on a particular attribute value. Example: `Teddy (#33)`"
          ),
          quantity: Joi.number().description(
            "Quantity of tokens user is buying. Only compatible with ERC1155 tokens. Example: `5`"
          ),
          weiPrice: Joi.string()
            .pattern(regex.number)
            .description("Amount bidder is willing to offer in wei. Example: `1000000000000000000`")
            .required(),
          orderKind: Joi.string()
            .valid(
              "zeroex-v4",
              "seaport",
              "seaport-v1.4",
              "looks-rare",
              "x2y2",
              "universe",
              "infinity",
              "flow"
            )
            .default("seaport-v1.4")
            .description("Exchange protocol used to create order. Example: `seaport`"),
          orderbook: Joi.string()
            .valid("reservoir", "opensea", "looks-rare", "x2y2", "universe", "infinity", "flow")
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
            .default(Sdk.Common.Addresses.Weth[config.chainId]),
        })
          .or("token", "collection", "tokenSetId")
          .oxor("token", "collection", "tokenSetId")
          .with("attributeValue", "attributeKey")
          .with("attributeKey", "attributeValue")
          .with("attributeKey", "collection")
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
    }).label(`getExecuteBid${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-bid-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

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
        orderKind: string;
        orderbook: string;
        orderbookApiKey?: string;
        automatedRoyalties: boolean;
        royaltyBps?: number;
        excludeFlaggedTokens: boolean;
        fees: string[];
        currency: string;
        listingTime?: number;
        expirationTime?: number;
        salt?: string;
        nonce?: string;
      }[];

      // TODO: This shouldn't be here
      let currency = "ETH";
      let wrappedCurrency = "WETH";
      switch (config.chainId) {
        case 137:
          currency = "MATIC";
          wrappedCurrency = "WMATIC";
          break;
      }

      // Set up generic bid steps
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
          id: "currency-wrapping",
          action: `Wrapping ${currency}`,
          description: `We'll ask your approval for converting ${currency} to ${wrappedCurrency}. Gas fee required.`,
          kind: "transaction",
          items: [],
        },
        {
          id: "currency-approval",
          action: `Approve ${wrappedCurrency} contract`,
          description:
            "We'll ask your approval for the exchange to access your token. This is a one-time only operation per exchange.",
          kind: "transaction",
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
        "seaport-v1.4": [] as {
          order: {
            kind: "seaport-v1.4";
            data: Sdk.SeaportV14.Types.OrderComponents;
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

      const errors: { message: string; orderIndex: number }[] = [];
      await Promise.all(
        params.map(async (params, i) => {
          const token = params.token;
          const collectionId = params.collection;
          const tokenSetId = params.tokenSetId;
          const attributeKey = params.attributeKey;
          const attributeValue = params.attributeValue;

          // Only single-contract token sets are biddable
          if (tokenSetId && tokenSetId.startsWith("list") && tokenSetId.split(":").length !== 3) {
            return errors.push({
              message: `Token set ${tokenSetId} is not biddable`,
              orderIndex: i,
            });
          }

          // TODO: Fix cross-posting collection bids to LooksRare and X2Y2
          if (!token && !["reservoir", "opensea"].includes(params.orderbook)) {
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

          try {
            // Check the maker's balance
            const currency = new Sdk.Common.Helpers.Erc20(baseProvider, params.currency);
            const currencyBalance = await currency.getBalance(maker);
            if (bn(currencyBalance).lt(params.weiPrice)) {
              if (params.currency === Sdk.Common.Addresses.Weth[config.chainId]) {
                const ethBalance = await baseProvider.getBalance(maker);
                if (bn(currencyBalance).add(ethBalance).lt(params.weiPrice)) {
                  return errors.push({
                    message: "Maker does not have sufficient balance",
                    orderIndex: i,
                  });
                } else {
                  const weth = new Sdk.Common.Helpers.Weth(baseProvider, config.chainId);
                  const wrapTx = weth.depositTransaction(
                    maker,
                    bn(params.weiPrice).sub(currencyBalance)
                  );

                  steps[0].items.push({
                    status: "incomplete",
                    data: wrapTx,
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

            switch (params.orderKind) {
              case "seaport": {
                if (!["reservoir", "opensea"].includes(params.orderbook)) {
                  return errors.push({
                    message: "Unsupported orderbook",
                    orderIndex: i,
                  });
                }

                let order: Sdk.Seaport.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await seaportBuyToken.build({
                    ...params,
                    orderbook: params.orderbook as "reservoir" | "opensea",
                    maker,
                    contract,
                    tokenId,
                    source,
                  });
                } else if (tokenSetId) {
                  order = await seaportBuyAttribute.build({
                    ...params,
                    orderbook: params.orderbook as "reservoir" | "opensea",
                    maker,
                    source,
                  });
                } else if (attribute) {
                  order = await seaportBuyAttribute.build({
                    ...params,
                    orderbook: params.orderbook as "reservoir" | "opensea",
                    maker,
                    collection: attribute.collection,
                    attributes: [attribute],
                    source,
                  });
                } else if (collection) {
                  order = await seaportBuyCollection.build({
                    ...params,
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

                const exchange = new Sdk.Seaport.Exchange(config.chainId);
                const conduit = exchange.deriveConduit(order.params.conduitKey);

                // Check the maker's approval
                let approvalTx: TxData | undefined;
                const currencyApproval = await currency.getAllowance(maker, conduit);
                if (bn(currencyApproval).lt(order.getMatchingPrice())) {
                  approvalTx = currency.approveTransaction(maker, conduit);
                }

                steps[1].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
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
                          kind: "seaport",
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

                break;
              }

              case "seaport-v1.4": {
                if (!["reservoir", "opensea"].includes(params.orderbook)) {
                  return errors.push({
                    message: "Unsupported orderbook",
                    orderIndex: i,
                  });
                }

                let order: Sdk.SeaportV14.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await seaportV14BuyToken.build({
                    ...params,
                    orderbook: params.orderbook as "reservoir" | "opensea",
                    maker,
                    contract,
                    tokenId,
                    source,
                  });
                } else if (tokenSetId) {
                  order = await seaportV14BuyAttribute.build({
                    ...params,
                    orderbook: params.orderbook as "reservoir" | "opensea",
                    maker,
                    source,
                  });
                } else if (attribute) {
                  order = await seaportV14BuyAttribute.build({
                    ...params,
                    orderbook: params.orderbook as "reservoir" | "opensea",
                    maker,
                    collection: attribute.collection,
                    attributes: [attribute],
                    source,
                  });
                } else if (collection) {
                  order = await seaportV14BuyCollection.build({
                    ...params,
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

                const exchange = new Sdk.SeaportV14.Exchange(config.chainId);
                const conduit = exchange.deriveConduit(order.params.conduitKey);

                // Check the maker's approval
                let approvalTx: TxData | undefined;
                const currencyApproval = await currency.getAllowance(maker, conduit);
                if (bn(currencyApproval).lt(order.getMatchingPrice())) {
                  approvalTx = currency.approveTransaction(maker, conduit);
                }

                steps[1].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
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
                  tokenSetId,
                  attribute,
                  collection,
                  isNonFlagged: params.excludeFlaggedTokens,
                  orderbook: params.orderbook,
                  orderbookApiKey: params.orderbookApiKey,
                  source,
                  orderIndex: i,
                });

                break;
              }

              case "zeroex-v4": {
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
                const wethApproval = await currency.getAllowance(
                  maker,
                  Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
                );
                if (
                  bn(wethApproval).lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))
                ) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
                  );
                }

                steps[1].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
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

                break;
              }

              case "looks-rare": {
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

                let order: Sdk.LooksRare.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await looksRareBuyToken.build({
                    ...params,
                    maker,
                    contract,
                    tokenId,
                  });
                } else if (collection) {
                  order = await looksRareBuyCollection.build({
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
                const wethApproval = await currency.getAllowance(
                  maker,
                  Sdk.LooksRare.Addresses.Exchange[config.chainId]
                );
                if (bn(wethApproval).lt(bn(order.params.price))) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.LooksRare.Addresses.Exchange[config.chainId]
                  );
                }

                steps[1].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
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
                          kind: "looks-rare",
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

                break;
              }

              case "infinity": {
                if (!["infinity"].includes(params.orderbook)) {
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

                let order: Sdk.Infinity.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await infinityBuyToken.build({
                    ...params,
                    orderbook: "infinity",
                    maker,
                    contract,
                    tokenId,
                  });
                } else if (collection) {
                  order = await infinityBuyCollection.build({
                    ...params,
                    orderbook: "infinity",
                    maker,
                    contract: collection,
                  });
                } else {
                  return errors.push({
                    message: "Only token and collection bids are supported",
                    orderIndex: i,
                  });
                }

                let approvalTx: TxData | undefined;
                const wethApproval = await currency.getAllowance(
                  maker,
                  Sdk.Infinity.Addresses.Exchange[config.chainId]
                );

                if (
                  bn(wethApproval).lt(bn(order.params.startPrice)) ||
                  bn(wethApproval).lt(bn(order.params.endPrice))
                ) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.Infinity.Addresses.Exchange[config.chainId]
                  );
                }

                steps[1].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
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
                          kind: "infinity",
                          data: {
                            ...order.params,
                          },
                        },
                        tokenSetId,
                        collection,
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
                if (!["infinity"].includes(params.orderbook)) {
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

                let order: Sdk.Flow.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await flowBuyToken.build({
                    ...params,
                    orderbook: "flow",
                    maker,
                    contract,
                    tokenId,
                  });
                } else if (collection) {
                  order = await flowBuyCollection.build({
                    ...params,
                    orderbook: "flow",
                    maker,
                    contract: collection,
                  });
                } else {
                  return errors.push({
                    message: "Only token and collection bids are supported",
                    orderIndex: i,
                  });
                }

                let approvalTx: TxData | undefined;
                const wethApproval = await currency.getAllowance(
                  maker,
                  Sdk.Flow.Addresses.Exchange[config.chainId]
                );

                if (
                  bn(wethApproval).lt(bn(order.params.startPrice)) ||
                  bn(wethApproval).lt(bn(order.params.endPrice))
                ) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.Flow.Addresses.Exchange[config.chainId]
                  );
                }

                steps[1].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
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
                          kind: "flow",
                          data: {
                            ...order.params,
                          },
                        },
                        tokenSetId,
                        collection,
                        orderbook: params.orderbook,
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
                const wethApproval = await currency.getAllowance(
                  maker,
                  Sdk.X2Y2.Addresses.Exchange[config.chainId]
                );
                if (bn(wethApproval).lt(bn(upstreamOrder.params.price))) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.X2Y2.Addresses.Exchange[config.chainId]
                  );
                }

                steps[1].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
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

                break;
              }

              case "universe": {
                if (!["universe"].includes(params.orderbook)) {
                  return errors.push({
                    message: "Unsupported orderbook",
                    orderIndex: i,
                  });
                }

                let order: Sdk.Universe.Order;
                if (token) {
                  const [contract, tokenId] = token.split(":");
                  order = await universeBuyToken.build({
                    ...params,
                    maker,
                    contract,
                    tokenId,
                  });
                } else {
                  return errors.push({
                    message: "Only token bids are supported",
                    orderIndex: i,
                  });
                }

                // Check the maker's approval
                let approvalTx: TxData | undefined;
                const wethApproval = await currency.getAllowance(
                  maker,
                  Sdk.Universe.Addresses.Exchange[config.chainId]
                );
                if (bn(wethApproval).lt(bn(order.params.make.value))) {
                  approvalTx = currency.approveTransaction(
                    maker,
                    Sdk.Universe.Addresses.Exchange[config.chainId]
                  );
                }

                steps[1].items.push({
                  status: !approvalTx ? "complete" : "incomplete",
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
                    tokenSetId: o.tokenSetId,
                    attribute: o.attribute,
                    collection: o.collection,
                    isNonFlagged: o.isNonFlagged,
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

      // We should only have a single wrapping transaction
      if (steps[0].items.length > 1) {
        let amount = bn(0);
        for (let i = 0; i < steps[0].items.length; i++) {
          const itemAmount = bn(steps[0].items[i].data?.value || 0);
          if (itemAmount.gt(amount)) {
            amount = itemAmount;
          }
        }

        if (amount.gt(0)) {
          const weth = new Sdk.Common.Helpers.Weth(baseProvider, config.chainId);
          const wrapTx = weth.depositTransaction(maker, amount);

          steps[0].items = [
            {
              status: "incomplete",
              data: wrapTx,
            },
          ];
        } else {
          steps[0].items = [];
        }
      }

      if (!steps[2].items.length) {
        const error = Boom.badRequest("No bids can be created");
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
        logger.error(`get-execute-bid-${version}-handler`, `Handler failure: ${error}`);
      }
      throw error;
    }
  },
};
