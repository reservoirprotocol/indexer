/* eslint-disable @typescript-eslint/no-explicit-any */

import { AddressZero } from "@ethersproject/constants";
import { joinSignature } from "@ethersproject/bytes";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import Joi from "joi";

import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import * as commonHelpers from "@/orderbook/orders/common/helpers";

// LooksRare
import * as looksRareSellToken from "@/orderbook/orders/looks-rare/build/sell/token";
import * as looksRareCheck from "@/orderbook/orders/looks-rare/check";

// Seaport
import * as seaportSellToken from "@/orderbook/orders/seaport-v1.1/build/sell/token";
import * as seaportCheck from "@/orderbook/orders/seaport-v1.1/check";

// X2Y2
import * as x2y2SellToken from "@/orderbook/orders/x2y2/build/sell/token";
import * as x2y2Check from "@/orderbook/orders/x2y2/check";

// ZeroExV4
import * as zeroExV4SellToken from "@/orderbook/orders/zeroex-v4/build/sell/token";
import * as zeroExV4Check from "@/orderbook/orders/zeroex-v4/check";

const version = "v2";

export const getExecuteListV2Options: RouteOptions = {
  description: "Create ask (listing)",
  notes: "Generate a listing and submit it to multiple marketplaces",
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
        .required()
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      quantity: Joi.number().description(
        "Quanity of tokens user is listing. Only compatible with ERC1155 tokens. Example: `5`"
      ),
      maker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description(
          "Address of wallet making the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      weiPrice: Joi.string()
        .pattern(regex.number)
        .required()
        .description("Amount seller is willing to sell for in wei. Example: `1000000000000000000`"),
      orderKind: Joi.string()
        .valid("looks-rare", "zeroex-v4", "seaport", "x2y2")
        .default("seaport")
        .description("Exchange protocol used to create order. Example: `seaport`"),
      orderbook: Joi.string()
        .valid("opensea", "looks-rare", "reservoir", "x2y2")
        .default("reservoir")
        .description("Orderbook where order is placed. Example: `Reservoir`"),
      source: Joi.string().description(
        "Name of the platform that created the order. Example: `Chimpers Market`"
      ),
      automatedRoyalties: Joi.boolean()
        .default(true)
        .description("If true, royalties will be automatically included."),
      fee: Joi.alternatives(
        Joi.string().pattern(regex.number),
        Joi.number(),
        Joi.array().items(Joi.string().pattern(regex.number)),
        Joi.array().items(Joi.number()).description("Fee amount in BPS. Example: `100`")
      ),
      feeRecipient: Joi.alternatives(
        Joi.string().lowercase().pattern(regex.address).disallow(AddressZero),
        Joi.array()
          .items(Joi.string().lowercase().pattern(regex.address).disallow(AddressZero))
          .description(
            "Wallet address of fee recipient. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
          )
      ),
      listingTime: Joi.alternatives(Joi.string().pattern(regex.number), Joi.number()).description(
        "Unix timestamp indicating when listing will be listed. Example: `1656080318`"
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
    }).label(`getExecuteList${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-list-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      const [contract, tokenId] = query.token.split(":");

      // Set up generic listing steps
      const steps = [
        {
          action: "Approve NFT contract",
          description:
            "Each NFT collection you want to trade requires a one-time approval transaction",
          kind: "transaction",
        },
        {
          action: "Authorize listing",
          description: "A free off-chain signature to create the listing",
          kind: "signature",
        },
        {
          action: "Submit listing",
          description: "Post your listing to the order book for others to discover it",
          kind: "request",
        },
      ];

      switch (query.orderKind) {
        case "zeroex-v4": {
          // Exchange-specific checks
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

          const order = await zeroExV4SellToken.build({
            ...query,
            contract,
            tokenId,
          });
          if (!order) {
            throw Boom.internal("Failed to generate order");
          }

          // Will be set if an approval is needed before listing
          let approvalTx: TxData | undefined;

          // Check the order's fillability
          try {
            await zeroExV4Check.offChainCheck(order, { onChainApprovalRecheck: true });
          } catch (error: any) {
            switch (error.message) {
              case "no-balance-no-approval":
              case "no-balance": {
                // We cannot do anything if the user doesn't own the listed token
                throw Boom.badData("Maker does not own the listed token");
              }

              case "no-approval": {
                // Generate an approval transaction
                const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";
                approvalTx = (
                  kind === "erc721"
                    ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.nft)
                    : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.nft)
                ).approveTransaction(query.maker, Sdk.ZeroExV4.Addresses.Exchange[config.chainId]);

                break;
              }
            }
          }

          const hasSignature = query.v && query.r && query.s;
          return {
            steps: [
              {
                ...steps[0],
                status: approvalTx ? "incomplete" : "complete",
                data: approvalTx,
              },
              {
                ...steps[1],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature ? undefined : order.getSignatureData(),
              },
              {
                ...steps[2],
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

        case "seaport": {
          // Exchange-specific checks
          if (!["reservoir", "opensea"].includes(query.orderbook)) {
            throw Boom.badRequest("Unsupported orderbook");
          }

          // Make sure the fee information is correctly typed
          if (query.fee && !Array.isArray(query.fee)) {
            query.fee = [query.fee];
          }
          if (query.feeRecipient && !Array.isArray(query.feeRecipient)) {
            query.feeRecipient = [query.feeRecipient];
          }
          if (query.fee?.length !== query.feeRecipient?.length) {
            throw Boom.badRequest("Invalid fee information");
          }

          const order = await seaportSellToken.build({
            ...query,
            contract,
            tokenId,
          });
          if (!order) {
            throw Boom.internal("Failed to generate order");
          }

          // Will be set if an approval is needed before listing
          let approvalTx: TxData | undefined;

          // Check the order's fillability
          try {
            await seaportCheck.offChainCheck(order, { onChainApprovalRecheck: true });
          } catch (error: any) {
            switch (error.message) {
              case "no-balance-no-approval":
              case "no-balance": {
                // We cannot do anything if the user doesn't own the listed token
                throw Boom.badData("Maker does not own the listed token");
              }

              case "no-approval": {
                // Generate an approval transaction

                const exchange = new Sdk.SeaportV11.Exchange(config.chainId);
                const info = order.getInfo()!;

                const kind = order.params.kind?.startsWith("erc721") ? "erc721" : "erc1155";
                approvalTx = (
                  kind === "erc721"
                    ? new Sdk.Common.Helpers.Erc721(baseProvider, info.contract)
                    : new Sdk.Common.Helpers.Erc1155(baseProvider, info.contract)
                ).approveTransaction(query.maker, exchange.deriveConduit(order.params.conduitKey));

                break;
              }
            }
          }

          const hasSignature = query.v && query.r && query.s;
          return {
            steps: [
              {
                ...steps[0],
                status: approvalTx ? "incomplete" : "complete",
                data: approvalTx,
              },
              {
                ...steps[1],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature ? undefined : order.getSignatureData(),
              },
              {
                ...steps[2],
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
                            // Seaport takes the joined signature
                            signature: joinSignature({ v: query.v, r: query.r, s: query.s }),
                          },
                        },
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
              nonce: order.params.counter,
            },
          };
        }

        case "looks-rare": {
          if (!["reservoir", "looks-rare"].includes(query.orderbook)) {
            throw Boom.badRequest("Unsupported orderbook");
          }
          if (query.fee) {
            throw Boom.badRequest("LooksRare does not supported custom fees");
          }

          const order = await looksRareSellToken.build({
            ...query,
            contract,
            tokenId,
          });
          if (!order) {
            throw Boom.internal("Failed to generate order");
          }

          // Will be set if an approval is needed before listing
          let approvalTx: TxData | undefined;

          // Check the order's fillability
          try {
            await looksRareCheck.offChainCheck(order, { onChainApprovalRecheck: true });
          } catch (error: any) {
            switch (error.message) {
              case "no-balance-no-approval":
              case "no-balance": {
                // We cannot do anything if the user doesn't own the listed token
                throw Boom.badData("Maker does not own the listed token");
              }

              case "no-approval": {
                const contractKind = await commonHelpers.getContractKind(contract);
                if (!contractKind) {
                  throw Boom.internal("Missing contract kind");
                }

                // Generate an approval transaction
                approvalTx = (
                  contractKind === "erc721"
                    ? new Sdk.Common.Helpers.Erc721(baseProvider, order.params.collection)
                    : new Sdk.Common.Helpers.Erc1155(baseProvider, order.params.collection)
                ).approveTransaction(
                  query.maker,
                  contractKind === "erc721"
                    ? Sdk.LooksRare.Addresses.TransferManagerErc721[config.chainId]
                    : Sdk.LooksRare.Addresses.TransferManagerErc1155[config.chainId]
                );

                break;
              }
            }
          }

          const hasSignature = query.v && query.r && query.s;
          return {
            steps: [
              {
                ...steps[0],
                status: approvalTx ? "incomplete" : "complete",
                data: approvalTx,
              },
              {
                ...steps[1],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature ? undefined : order.getSignatureData(),
              },
              {
                ...steps[2],
                status: "incomplete",
                data: !hasSignature
                  ? undefined
                  : {
                      endpoint: "/order/v2",
                      method: "POST",
                      body: {
                        order: {
                          kind: "looks-rare",
                          data: {
                            ...order.params,
                            v: query.v,
                            r: query.r,
                            s: query.s,
                          },
                        },
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
              nonce: order.params.nonce,
            },
          };
        }

        case "x2y2": {
          if (!["x2y2"].includes(query.orderbook)) {
            throw Boom.badRequest("Unsupported orderbook");
          }
          if (query.fee || query.feeRecipient) {
            throw Boom.badRequest("X2Y2 does not supported custom fees");
          }

          const order = await x2y2SellToken.build({
            ...query,
            contract,
            tokenId,
          });
          if (!order) {
            throw Boom.internal("Failed to generate order");
          }

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
                // We cannot do anything if the user doesn't own the listed token
                throw Boom.badData("Maker does not own the listed token");
              }

              case "no-approval": {
                const contractKind = await commonHelpers.getContractKind(contract);
                if (!contractKind) {
                  throw Boom.internal("Missing contract kind");
                }

                // Generate an approval transaction
                approvalTx = new Sdk.Common.Helpers.Erc721(
                  baseProvider,
                  upstreamOrder.params.nft.token
                ).approveTransaction(
                  query.maker,
                  Sdk.X2Y2.Addresses.Erc721Delegate[config.chainId]
                );

                break;
              }
            }
          }

          const hasSignature = query.v && query.r && query.s;
          return {
            steps: [
              {
                ...steps[0],
                status: approvalTx ? "incomplete" : "complete",
                data: approvalTx,
              },
              {
                ...steps[1],
                status: hasSignature ? "complete" : "incomplete",
                data: hasSignature
                  ? undefined
                  : new Sdk.X2Y2.Exchange(config.chainId, config.x2y2ApiKey).getOrderSignatureData(
                      order
                    ),
              },
              {
                ...steps[2],
                status: "incomplete",
                data: !hasSignature
                  ? undefined
                  : {
                      endpoint: "/order/v2",
                      method: "POST",
                      body: {
                        order: {
                          kind: "x2y2",
                          data: {
                            ...order,
                            v: query.v,
                            r: query.r,
                            s: query.s,
                          },
                        },
                        orderbook: query.orderbook,
                        source: query.source,
                      },
                    },
              },
            ],
            query: {
              ...query,
              expirationTime: order.deadline,
              salt: order.salt,
            },
          };
        }
      }
    } catch (error) {
      logger.error(`get-execute-list-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
