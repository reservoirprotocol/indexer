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
import { ExecutionsBuffer } from "@/utils/executions";

// LooksRare
import * as looksRareV2BuyToken from "@/orderbook/orders/looks-rare-v2/build/buy/token";
import * as looksRareV2BuyCollection from "@/orderbook/orders/looks-rare-v2/build/buy/collection";

// Seaport v1.5
import * as seaportV15BuyAttribute from "@/orderbook/orders/seaport-v1.5/build/buy/attribute";
import * as seaportV15BuyToken from "@/orderbook/orders/seaport-v1.5/build/buy/token";
import * as seaportV15BuyCollection from "@/orderbook/orders/seaport-v1.5/build/buy/collection";

// X2Y2
import * as x2y2BuyCollection from "@/orderbook/orders/x2y2/build/buy/collection";
import * as x2y2BuyToken from "@/orderbook/orders/x2y2/build/buy/token";

// ZeroExV4
import * as zeroExV4BuyAttribute from "@/orderbook/orders/zeroex-v4/build/buy/attribute";
import * as zeroExV4BuyToken from "@/orderbook/orders/zeroex-v4/build/buy/token";
import * as zeroExV4BuyCollection from "@/orderbook/orders/zeroex-v4/build/buy/collection";

const version = "v4";

export const getExecuteBidV4Options: RouteOptions = {
  description: "Create bid (offer)",
  notes: "Generate a bid and submit it to multiple marketplaces",
  timeout: { server: 60000 },
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
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
      params: Joi.array()
        .items(
          Joi.object({
            token: Joi.string()
              .lowercase()
              .pattern(regex.token)
              .description(
                "Bid on a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
              ),
            tokenSetId: Joi.string().description("Bid on a particular token set."),
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
              .description(
                "Amount bidder is willing to offer in wei. Example: `1000000000000000000`"
              )
              .required(),
            orderKind: Joi.string()
              .valid(
                "zeroex-v4",
                "seaport",
                "seaport-v1.4",
                "seaport-v1.5",
                "looks-rare",
                "looks-rare-v2",
                "x2y2"
              )
              .default("seaport-v1.5")
              .description("Exchange protocol used to create order. Example: `seaport-v1.5`"),
            orderbook: Joi.string()
              .valid("reservoir", "opensea", "looks-rare", "x2y2")
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
              .default(Sdk.Common.Addresses.WNative[config.chainId]),
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
          id: Joi.string().required(),
          kind: Joi.string().valid("request", "signature", "transaction").required(),
          action: Joi.string().required(),
          description: Joi.string().required(),
          items: Joi.array()
            .items(
              Joi.object({
                status: Joi.string().valid("complete", "incomplete").required(),
                data: Joi.object(),
                orderIndex: Joi.number(),
              })
            )
            .required(),
        })
      ),
      query: Joi.object(),
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
      const maker = payload.maker;
      const source = payload.source;

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
          orderIndex?: number;
        }[];
      }[] = [
        {
          id: "wallet-initialization",
          action: "Initialize wallet",
          description: "One-time initialization of wallet",
          kind: "transaction",
          items: [],
        },
        {
          id: "weth-wrapping",
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

      for (let i = 0; i < payload.params.length; i++) {
        const params = payload.params[i];

        const token = params.token;
        const collection = params.collection;
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

        if (tokenSetId && tokenSetId.startsWith("list") && tokenSetId.split(":").length !== 3) {
          throw Boom.badRequest(`Token set ${tokenSetId} is not biddable`);
        }

        if (!token) {
          // TODO: Re-enable collection/attribute bids on external orderbooks
          if (!["reservoir", "opensea"].includes(params.orderbook)) {
            throw Boom.badRequest("Only single-token bids are supported on external orderbooks");
          }
        }

        // Handle fees
        // TODO: Refactor the builders to get rid of the separate fee/feeRecipient arrays
        // TODO: Refactor the builders to get rid of the API params naming dependency
        params.fee = [];
        params.feeRecipient = [];
        for (const feeData of params.fees ?? []) {
          const [feeRecipient, fee] = feeData.split(":");
          params.fee.push(fee);
          params.feeRecipient.push(feeRecipient);
        }

        // Check the maker's balance
        let wrapEthTx: TxData | undefined;
        const currency = new Sdk.Common.Helpers.Erc20(baseProvider, params.currency);
        const currencyBalance = await currency.getBalance(maker);
        if (bn(currencyBalance).lt(params.weiPrice)) {
          if (params.currency === Sdk.Common.Addresses.WNative[config.chainId]) {
            const ethBalance = await baseProvider.getBalance(maker);
            if (bn(currencyBalance).add(ethBalance).lt(params.weiPrice)) {
              throw Boom.badData("Maker does not have sufficient balance");
            } else {
              const weth = new Sdk.Common.Helpers.WNative(baseProvider, config.chainId);
              wrapEthTx = weth.depositTransaction(maker, bn(params.weiPrice).sub(currencyBalance));
            }
          } else {
            throw Boom.badData("Maker does not have sufficient balance");
          }
        }

        switch (params.orderKind) {
          case "seaport-v1.5": {
            if (!["reservoir", "opensea"].includes(params.orderbook)) {
              throw Boom.badRequest("Only `reservoir` and `opensea` are supported as orderbooks");
            }

            let order: Sdk.SeaportV15.Order;
            if (token) {
              const [contract, tokenId] = token.split(":");
              order = await seaportV15BuyToken.build({
                ...params,
                maker,
                contract,
                tokenId,
                source,
              });
            } else if (tokenSetId || (collection && attributeKey && attributeValue)) {
              order = await seaportV15BuyAttribute.build({
                ...params,
                maker,
                collection,
                attributes: [
                  {
                    key: attributeKey,
                    value: attributeValue,
                  },
                ],
                source,
              });
            } else if (collection) {
              order = await seaportV15BuyCollection.build({
                ...params,
                maker,
                collection,
                source,
              });
            } else {
              throw Boom.internal("Wrong metadata");
            }

            const exchange = new Sdk.SeaportV15.Exchange(config.chainId);
            const conduit = exchange.deriveConduit(order.params.conduitKey);

            // Check the maker's approval
            let approvalTx: TxData | undefined;
            const currencyApproval = await currency.getAllowance(maker, conduit);
            if (bn(currencyApproval).lt(order.getMatchingPrice())) {
              approvalTx = currency.approveTransaction(maker, conduit);
            }

            steps[1].items.push({
              status: !wrapEthTx ? "complete" : "incomplete",
              data: wrapEthTx,
              orderIndex: i,
            });
            steps[2].items.push({
              status: !approvalTx ? "complete" : "incomplete",
              data: approvalTx,
              orderIndex: i,
            });
            steps[3].items.push({
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
                    tokenSetId,
                    attribute:
                      collection && attributeKey && attributeValue
                        ? {
                            collection,
                            key: attributeKey,
                            value: attributeValue,
                          }
                        : undefined,
                    collection:
                      collection && !attributeKey && !attributeValue ? collection : undefined,
                    isNonFlagged: params.excludeFlaggedTokens,
                    orderbook: params.orderbook,
                    orderbookApiKey: params.orderbookApiKey,
                    source,
                  },
                },
              },
              orderIndex: i,
            });

            addExecution(order.hash(), params.quantity);

            // Go on with the next bid
            continue;
          }

          case "zeroex-v4": {
            if (!["reservoir"].includes(params.orderbook)) {
              throw Boom.badRequest("Only `reservoir` is supported as orderbook");
            }

            let order: Sdk.ZeroExV4.Order | undefined;
            if (token) {
              const [contract, tokenId] = token.split(":");
              order = await zeroExV4BuyToken.build({
                ...params,
                maker,
                contract,
                tokenId,
              });
            } else if (tokenSetId || (collection && attributeKey && attributeValue)) {
              order = await zeroExV4BuyAttribute.build({
                ...params,
                maker,
                collection,
                attributes: [
                  {
                    key: attributeKey,
                    value: attributeValue,
                  },
                ],
              });
            } else if (collection) {
              order = await zeroExV4BuyCollection.build({
                ...params,
                maker,
                collection,
              });
            }

            if (!order) {
              throw Boom.internal("Failed to generate order");
            }

            // Check the maker's approval
            let approvalTx: TxData | undefined;
            const wethApproval = await currency.getAllowance(
              maker,
              Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
            );
            if (bn(wethApproval).lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))) {
              approvalTx = currency.approveTransaction(
                maker,
                Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
              );
            }

            steps[1].items.push({
              status: !wrapEthTx ? "complete" : "incomplete",
              data: wrapEthTx,
              orderIndex: i,
            });
            steps[2].items.push({
              status: !approvalTx ? "complete" : "incomplete",
              data: approvalTx,
              orderIndex: i,
            });
            steps[3].items.push({
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
                    attribute:
                      collection && attributeKey && attributeValue
                        ? {
                            collection,
                            key: attributeKey,
                            value: attributeValue,
                          }
                        : undefined,
                    collection:
                      collection && !attributeKey && !attributeValue ? collection : undefined,
                    isNonFlagged: params.excludeFlaggedTokens,
                    orderbook: params.orderbook,
                    orderbookApiKey: params.orderbookApiKey,
                    source,
                  },
                },
              },
              orderIndex: i,
            });

            addExecution(order.hash(), params.quantity);

            // Go on with the next bid
            continue;
          }

          case "looks-rare-v2": {
            if (!["reservoir", "looks-rare"].includes(params.orderbook)) {
              throw Boom.badRequest(
                "Only `reservoir` and `looks-rare` are supported as orderbooks"
              );
            }
            if (params.fees?.length) {
              throw Boom.badRequest("LooksRare does not support custom fees");
            }
            if (params.excludeFlaggedTokens) {
              throw Boom.badRequest("LooksRare does not support token-list bids");
            }

            let order: Sdk.LooksRareV2.Order | undefined;
            if (token) {
              const [contract, tokenId] = token.split(":");
              order = await looksRareV2BuyToken.build({
                ...params,
                maker,
                contract,
                tokenId,
              });
            } else if (collection && !attributeKey && !attributeValue) {
              order = await looksRareV2BuyCollection.build({
                ...params,
                maker,
                collection,
              });
            } else {
              throw Boom.badRequest("LooksRare only supports single-token or collection-wide bids");
            }

            if (!order) {
              throw Boom.internal("Failed to generate order");
            }

            // Check the maker's approval
            let approvalTx: TxData | undefined;
            const wethApproval = await currency.getAllowance(
              maker,
              Sdk.LooksRareV2.Addresses.Exchange[config.chainId]
            );
            if (bn(wethApproval).lt(bn(order.params.price))) {
              approvalTx = currency.approveTransaction(
                maker,
                Sdk.LooksRareV2.Addresses.Exchange[config.chainId]
              );
            }

            steps[1].items.push({
              status: !wrapEthTx ? "complete" : "incomplete",
              data: wrapEthTx,
              orderIndex: i,
            });
            steps[2].items.push({
              status: !approvalTx ? "complete" : "incomplete",
              data: approvalTx,
              orderIndex: i,
            });
            steps[3].items.push({
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
                    collection:
                      collection && !attributeKey && !attributeValue ? collection : undefined,
                    orderbook: params.orderbook,
                    orderbookApiKey: params.orderbookApiKey,
                    source,
                  },
                },
              },
              orderIndex: i,
            });

            addExecution(order.hash(), params.quantity);

            // Go on with the next bid
            continue;
          }

          case "x2y2": {
            if (!["x2y2"].includes(params.orderbook)) {
              throw Boom.badRequest("Only `x2y2` is supported as orderbook");
            }
            if (params.fees?.length) {
              throw Boom.badRequest("X2Y2 does not support explicit fees");
            }

            let order: Sdk.X2Y2.Types.LocalOrder | undefined;
            if (token) {
              const [contract, tokenId] = token.split(":");
              order = await x2y2BuyToken.build({
                ...params,
                maker,
                contract,
                tokenId,
              });
            } else if (collection && !attributeKey && !attributeValue) {
              order = await x2y2BuyCollection.build({
                ...params,
                maker,
                collection,
              });
            } else {
              throw Boom.badRequest("X2Y2 only supports single-token or collection-wide bids");
            }

            if (!order) {
              throw Boom.internal("Failed to generate order");
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
              status: !wrapEthTx ? "complete" : "incomplete",
              data: wrapEthTx,
              orderIndex: i,
            });
            steps[2].items.push({
              status: !approvalTx ? "complete" : "incomplete",
              data: approvalTx,
              orderIndex: i,
            });
            steps[3].items.push({
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
                    collection:
                      collection && !attributeKey && !attributeValue ? collection : undefined,
                    orderbook: params.orderbook,
                    orderbookApiKey: params.orderbookApiKey,
                    source,
                  },
                },
              },
              orderIndex: i,
            });

            addExecution(new Sdk.X2Y2.Exchange(config.chainId, "").hash(order), params.quantity);

            // Go on with the next bid
            continue;
          }
        }
      }

      // We should only have a single ETH wrapping transaction
      if (steps[1].items.length > 1) {
        let amount = bn(0);
        for (let i = 0; i < steps[0].items.length; i++) {
          const itemAmount = bn(steps[0].items[i].data?.value || 0);
          if (itemAmount.gt(amount)) {
            amount = itemAmount;
          }
        }

        if (amount.gt(0)) {
          const weth = new Sdk.Common.Helpers.WNative(baseProvider, config.chainId);
          const wethWrapTx = weth.depositTransaction(maker, amount);

          steps[1].items = [
            {
              status: "incomplete",
              data: wethWrapTx,
            },
          ];
        } else {
          steps[1].items = [];
        }
      }

      // De-duplicate step items
      for (const step of steps) {
        // Assume `JSON.stringify` is deterministic
        const uniqueItems = _.uniqBy(step.items, ({ data }) => JSON.stringify(data));
        if (step.items.length > uniqueItems.length) {
          step.items = uniqueItems.map((item) => ({
            status: item.status,
            data: item.data,
            orderIndex: item.orderIndex,
          }));
        }
      }

      await executionsBuffer.flush();

      return { steps };
    } catch (error) {
      if (error instanceof Boom.Boom && error.output.statusCode === 400) {
        logger.warn(`get-execute-bid-${version}-handler`, `Handler failure: ${error}`);
      } else {
        logger.error(`get-execute-bid-${version}-handler`, `Handler failure: ${error}`);
      }

      throw error;
    }
  },
};
