/* eslint-disable @typescript-eslint/no-explicit-any */

import { joinSignature } from "@ethersproject/bytes";
import { AddressZero } from "@ethersproject/constants";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, regex } from "@/common/utils";
import { config } from "@/config/index";

// Seaport
import * as seaportBuyAttribute from "@/orderbook/orders/seaport-v1.1/build/buy/attribute";
import * as seaportBuyToken from "@/orderbook/orders/seaport-v1.1/build/buy/token";
import * as seaportBuyCollection from "@/orderbook/orders/seaport-v1.1/build/buy/collection";

// ZeroExV4
import * as zeroExV4BuyAttribute from "@/orderbook/orders/zeroex-v4/build/buy/attribute";
import * as zeroExV4BuyToken from "@/orderbook/orders/zeroex-v4/build/buy/token";
import * as zeroExV4BuyCollection from "@/orderbook/orders/zeroex-v4/build/buy/collection";

const version = "v2";

export const getExecuteBidV2Options: RouteOptions = {
  description: "Create bid (offer)",
  notes: "Generate a bid and submit it to multiple marketplaces",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    query: Joi.object({
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
        "Quanity of tokens user is buying. Only compatible with ERC1155 tokens. Example: `5`"
      ),
      maker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Address of wallet making the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        )
        .required(),
      weiPrice: Joi.string()
        .pattern(regex.number)
        .description("Amount bidder is willing to offer in wei. Example: `1000000000000000000`")
        .required(),
      orderKind: Joi.string()
        .valid("zeroex-v4", "seaport")
        .default("seaport")
        .description("Exchange protocol used to create order. Example: `seaport`"),
      orderbook: Joi.string()
        .valid("reservoir", "opensea")
        .default("reservoir")
        .description("Orderbook where order is placed. Example: `Reservoir`"),
      source: Joi.string().description(
        "Name of the platform that created the order. Example: `Chimpers Market`"
      ),
      automatedRoyalties: Joi.boolean()
        .default(true)
        .description("If true, royalties will be automatically included."),
      fee: Joi.alternatives(Joi.string().pattern(regex.number), Joi.number()).description(
        "Fee amount in BPS. Example: `100`"
      ),
      excludeFlaggedTokens: Joi.boolean()
        .default(false)
        .description("If true flagged tokens will be excluded"),
      feeRecipient: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .description(
          "Wallet address of fee recipient. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        )
        .disallow(AddressZero),
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
        .pattern(/^\d+$/)
        .description("Optional. Random string to make the order unique"),
      nonce: Joi.string().pattern(regex.number).description("Optional. Set a custom nonce"),
      v: Joi.number().description(
        "Signature v component (only required after order has been signed)"
      ),
      r: Joi.string()
        .lowercase()
        .pattern(regex.bytes32)
        .description("Signature r component (only required after order has been signed)"),
      s: Joi.string()
        .lowercase()
        .pattern(regex.bytes32)
        .description("Signature s component (only required after order has been signed)"),
    })
      .or("token", "collection", "tokenSetId")
      .oxor("token", "collection", "tokenSetId")
      .with("attributeValue", "attributeKey")
      .with("attributeKey", "attributeValue")
      .with("attributeKey", "collection")
      .with("feeRecipient", "fee")
      .with("fee", "feeRecipient"),
  },
  response: {
    schema: Joi.object({
      steps: Joi.array().items(
        Joi.object({
          action: Joi.string().required(),
          description: Joi.string().required(),
          status: Joi.string().valid("complete", "incomplete").required(),
          kind: Joi.string().valid("request", "signature", "transaction").required(),
          data: Joi.object(),
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
    const query = request.query as any;

    try {
      const token = query.token;
      const collection = query.collection;
      const tokenSetId = query.tokenSetId;
      const attributeKey = query.attributeKey;
      const attributeValue = query.attributeValue;

      if (tokenSetId && tokenSetId.startsWith("list") && tokenSetId.split(":").length !== 3) {
        throw Boom.badRequest(`Token set ${tokenSetId} is not biddable`);
      }

      // TODO: Re-enable collection/attribute bids on external orderbooks
      if (!token && query.orderbook !== "reservoir") {
        throw Boom.badRequest("Only single-token bids are supported on external orderbooks");
      }

      // Set up generic bid creation steps
      const steps = [
        {
          action: "Wrapping ETH",
          description: "We'll ask your approval for converting ETH to WETH. Gas fee required.",
          kind: "transaction",
        },
        {
          action: "Approve WETH contract",
          description:
            "We'll ask your approval for the exchange to access your token. This is a one-time only operation per exchange.",
          kind: "transaction",
        },
        {
          action: "Authorize offer",
          description: "A free off-chain signature to create the offer",
          kind: "signature",
        },
        {
          action: "Submit offer",
          description: "Post your offer to the order book for others to discover it",
          kind: "request",
        },
      ];

      // Check the maker's Weth/Eth balance
      let wrapEthTx: TxData | undefined;
      const weth = new Sdk.Common.Helpers.Weth(baseProvider, config.chainId);
      const wethBalance = await weth.getBalance(query.maker);
      if (bn(wethBalance).lt(query.weiPrice)) {
        const ethBalance = await baseProvider.getBalance(query.maker);
        if (bn(wethBalance).add(ethBalance).lt(query.weiPrice)) {
          // We cannot do anything if the maker doesn't have sufficient balance
          throw Boom.badData("Maker does not have sufficient balance");
        } else {
          wrapEthTx = weth.depositTransaction(query.maker, bn(query.weiPrice).sub(wethBalance));
        }
      }

      switch (query.orderKind) {
        case "seaport": {
          if (!["reservoir", "opensea"].includes(query.orderbook)) {
            throw Boom.badRequest("Unsupported orderbook");
          }

          // We want the fee params as arrays
          if (query.fee && !Array.isArray(query.fee)) {
            query.fee = [query.fee];
          }
          if (query.feeRecipient && !Array.isArray(query.feeRecipient)) {
            query.feeRecipient = [query.feeRecipient];
          }
          if (query.fee?.length !== query.feeRecipient?.length) {
            throw Boom.badRequest("Invalid fee info");
          }

          let order: Sdk.SeaportV11.Order;
          if (token) {
            const [contract, tokenId] = token.split(":");
            order = await seaportBuyToken.build({
              ...query,
              contract,
              tokenId,
            });
          } else if (tokenSetId || (collection && attributeKey && attributeValue)) {
            order = await seaportBuyAttribute.build({
              ...query,
              collection,
              attributes: [
                {
                  key: attributeKey,
                  value: attributeValue,
                },
              ],
            });
          } else if (collection) {
            order = await seaportBuyCollection.build({
              ...query,
              collection,
            });
          } else {
            throw Boom.internal("Wrong metadata");
          }

          const exchange = new Sdk.SeaportV11.Exchange(config.chainId);
          const conduit = exchange.deriveConduit(order.params.conduitKey);

          // Check the maker's WETH approval
          let approvalTx: TxData | undefined;
          const wethApproval = await weth.getAllowance(query.maker, conduit);
          if (bn(wethApproval).lt(order.getMatchingPrice())) {
            approvalTx = weth.approveTransaction(query.maker, conduit);
          }

          const hasSignature = query.v && query.r && query.s;
          return {
            steps: [
              {
                ...steps[0],
                status: !wrapEthTx ? "complete" : "incomplete",
                data: wrapEthTx,
              },
              {
                ...steps[1],
                status: !approvalTx ? "complete" : "incomplete",
                data: approvalTx,
              },
              {
                ...steps[2],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature ? undefined : order.getSignatureData(),
              },
              {
                ...steps[3],
                status: "incomplete",
                data: !hasSignature
                  ? undefined
                  : {
                      endpoint: "/order/v2",
                      method: "POST",
                      body: {
                        order: {
                          kind: "seaport",
                          data: {
                            ...order.params,
                            // Seaport requires the joined signature
                            signature: joinSignature({ v: query.v, r: query.r, s: query.s }),
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
                        isNonFlagged: query.excludeFlaggedTokens,
                        orderbook: query.orderbook,
                        source: query.source,
                      },
                    },
              },
            ],
            query: {
              ...query,
              listingTime: order.params.startTime,
              expirationTime: order.params.endTime,
              salt: order.params.salt,
            },
          };
        }

        case "zeroex-v4": {
          if (!["reservoir"].includes(query.orderbook)) {
            throw Boom.badRequest("Unsupported orderbook");
          }

          // Make sure the fee information is correctly types
          if (query.fee && !Array.isArray(query.fee)) {
            query.fee = [query.fee];
          }
          if (query.feeRecipient && !Array.isArray(query.feeRecipient)) {
            query.feeRecipient = [query.feeRecipient];
          }
          if (query.fee?.length !== query.feeRecipient?.length) {
            throw Boom.badRequest("Invalid fee information");
          }

          let order: Sdk.ZeroExV4.Order | undefined;
          if (token) {
            const [contract, tokenId] = token.split(":");
            order = await zeroExV4BuyToken.build({
              ...query,
              contract,
              tokenId,
            });
          } else if (tokenSetId || (collection && attributeKey && attributeValue)) {
            order = await zeroExV4BuyAttribute.build({
              ...query,
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
              ...query,
              collection,
            });
          }

          if (!order) {
            throw Boom.internal("Failed to generate order");
          }

          // Check the maker's approval
          let approvalTx: TxData | undefined;
          const wethApproval = await weth.getAllowance(
            query.maker,
            Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
          );
          if (bn(wethApproval).lt(bn(order.params.erc20TokenAmount).add(order.getFeeAmount()))) {
            approvalTx = weth.approveTransaction(
              query.maker,
              Sdk.ZeroExV4.Addresses.Exchange[config.chainId]
            );
          }

          const hasSignature = query.v && query.r && query.s;
          return {
            steps: [
              {
                ...steps[0],
                status: !wrapEthTx ? "complete" : "incomplete",
                data: wrapEthTx,
              },
              {
                ...steps[1],
                status: !approvalTx ? "complete" : "incomplete",
                data: approvalTx,
              },
              {
                ...steps[2],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature ? undefined : order.getSignatureData(),
              },
              {
                ...steps[3],
                status: "incomplete",
                data: !hasSignature
                  ? undefined
                  : {
                      endpoint: "/order/v2",
                      method: "POST",
                      body: {
                        order: {
                          kind: "zeroex-v4",
                          data: {
                            ...order.params,
                            v: query.v,
                            r: query.r,
                            s: query.s,
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
                        isNonFlagged: query.excludeFlaggedTokens,
                        orderbook: query.orderbook,
                        source: query.source,
                      },
                    },
              },
            ],
            query: {
              ...query,
              expirationTime: order.params.expiry,
              nonce: order.params.nonce,
            },
          };
        }
      }
    } catch (error) {
      logger.error(`get-execute-bid-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
