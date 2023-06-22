/* eslint-disable @typescript-eslint/no-explicit-any */

import { keccak256 } from "@ethersproject/solidity";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import axios from "axios";
import Joi from "joi";

import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { bn, fromBuffer, now, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as b from "@/utils/auth/blur";

const version = "v3";

export const getExecuteCancelV3Options: RouteOptions = {
  description: "Cancel orders",
  notes: "Cancel existing orders on any marketplace",
  tags: ["api", "Create Orders (list & bid)"],
  plugins: {
    "hapi-swagger": {
      order: 11,
    },
  },
  validate: {
    payload: Joi.object({
      orderIds: Joi.array().items(Joi.string()).min(1),
      maker: Joi.string().pattern(regex.address),
      orderKind: Joi.string().valid(
        "blur",
        "seaport",
        "seaport-v1.4",
        "seaport-v1.5",
        "looks-rare-v2",
        "zeroex-v4-erc721",
        "zeroex-v4-erc1155",
        "universe",
        "rarible",
        "flow",
        "alienswap"
      ),
      token: Joi.string().pattern(regex.token),
      blurAuth: Joi.string(),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price"),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price"),
    })
      .oxor("orderIds", "token")
      .or("orderIds", "token", "maker", "orderKind"),
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
                tip: Joi.string(),
                data: Joi.object(),
              })
            )
            .required(),
        })
      ),
    }).label(`getExecuteCancel${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-cancel-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    const gasSettings = {
      maxFeePerGas: payload.maxFeePerGas ? bn(payload.maxFeePerGas).toHexString() : undefined,
      maxPriorityFeePerGas: payload.maxPriorityFeePerGas
        ? bn(payload.maxPriorityFeePerGas).toHexString()
        : undefined,
    };

    // Cancel by maker
    if (payload.maker && !payload.token) {
      let cancelTx: TxData;
      switch (payload.orderKind) {
        case "seaport": {
          const exchange = new Sdk.SeaportV11.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(payload.maker);

          break;
        }

        case "seaport-v1.4": {
          const exchange = new Sdk.SeaportV14.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(payload.maker);
          break;
        }

        case "seaport-v1.5": {
          const exchange = new Sdk.SeaportV15.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(payload.maker);
          break;
        }

        case "alienswap": {
          const exchange = new Sdk.Alienswap.Exchange(config.chainId);
          cancelTx = exchange.cancelAllOrdersTx(payload.maker);
          break;
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      return {
        steps: [
          {
            id: "cancellation",
            action: "Submit cancellation",
            description:
              "To cancel these orders you must confirm the transaction and pay the gas fee",
            kind: "transaction",
            items: [
              {
                status: "incomplete",
                data: {
                  ...cancelTx,
                  ...gasSettings,
                },
              },
            ],
          },
        ],
      };
    }

    // Cancel by token or order ids
    try {
      // Handle Blur bids
      if (
        payload.orderIds &&
        payload.orderIds.find((orderId: string) => orderId.startsWith("blur-collection-bid"))
      ) {
        if (
          !payload.orderIds.every((orderId: string) => orderId.startsWith("blur-collection-bid"))
        ) {
          throw Boom.badRequest("Only Blur bids can be cancelled together");
        }

        const maker = payload.orderIds[0].split(":")[1];

        // Set up generic filling steps
        let steps: {
          id: string;
          action: string;
          description: string;
          kind: string;
          items: {
            status: string;
            tip?: string;
            data?: object;
          }[];
        }[] = [
          {
            id: "auth",
            action: "Sign in to Blur",
            description: "Some marketplaces require signing an auth message before filling",
            kind: "signature",
            items: [],
          },
          {
            id: "cancellation-signature",
            action: "Cancel order",
            description: "Authorize the cancellation of the order",
            kind: "signature",
            items: [],
          },
        ];

        // Handle Blur authentication
        const blurAuthId = b.getAuthId(maker);
        const blurAuth = await b.getAuth(blurAuthId);
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

          return { steps };
        } else {
          steps[0].items.push({
            status: "complete",
          });
        }

        const orderIds = payload.orderIds.sort();
        steps[1].items.push({
          status: "incomplete",
          data: {
            sign: {
              signatureKind: "eip191",
              message: keccak256(["string[]"], [orderIds]),
            },
            post: {
              endpoint: "/execute/cancel-signature/v1",
              method: "POST",
              body: {
                orderIds,
                orderKind: "blur-bid",
              },
            },
          },
        });

        if (steps[0].items[0].status === "complete") {
          steps = steps.slice(1);
        }

        return { steps };
      }

      // Fetch the orders to get cancelled
      const orderResults = payload.token
        ? await redb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                orders.maker,
                orders.raw_data
              FROM orders
              WHERE orders.token_set_id = $/tokenSetId/
                AND side = $/side/
                AND maker = $/maker/
                AND kind = $/orderKind/
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            `,
            {
              side: "sell",
              tokenSetId: `token:${payload.token}`,
              maker: toBuffer(payload.maker),
              orderKind: payload.orderKind,
            }
          )
        : await redb.manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                orders.maker,
                orders.raw_data
              FROM orders
              WHERE orders.id IN ($/ids:csv/)
                AND (orders.fillability_status = 'fillable' OR orders.fillability_status = 'no-balance')
            `,
            {
              ids: payload.orderIds,
            }
          );

      // Return early in case no matching orders were found
      if (!orderResults.length) {
        throw Boom.badRequest("No matching order(s)");
      }

      const isBulkCancel = orderResults.length > 1;
      const orderResult = orderResults[0];

      // When bulk-cancelling, make sure all orders have the same kind
      const supportedKinds = ["seaport", "seaport-v1.4", "seaport-v1.5", "alienswap"];
      if (isBulkCancel) {
        const supportsBulkCancel =
          supportedKinds.includes(orderResult.kind) &&
          orderResults.every((o) => o.kind === orderResult.kind);
        if (!supportsBulkCancel) {
          throw Boom.notImplemented("Bulk cancelling not supported");
        }
      }

      // Handle off-chain cancellations

      const cancellationZone = Sdk.SeaportBase.Addresses.ReservoirCancellationZone[config.chainId];
      const areAllSeaportV14OracleCancellable = orderResults.every(
        (o) => o.kind === "seaport-v1.4" && o.raw_data.zone === cancellationZone
      );
      const areAllSeaportV15OracleCancellable = orderResults.every(
        (o) => o.kind === "seaport-v1.5" && o.raw_data.zone === cancellationZone
      );
      const areAllAlienswapOracleCancellable = orderResults.every(
        (o) => o.kind === "alienswap" && o.raw_data.zone === cancellationZone
      );

      let oracleCancellableKind: string | undefined;
      if (areAllSeaportV14OracleCancellable) {
        oracleCancellableKind = "seaport-v1.4";
      } else if (areAllSeaportV15OracleCancellable) {
        oracleCancellableKind = "seaport-v1.5";
      } else if (areAllAlienswapOracleCancellable) {
        oracleCancellableKind = "alienswap";
      }

      if (oracleCancellableKind) {
        return {
          steps: [
            {
              id: "cancellation-signature",
              action: "Cancel order",
              description: "Authorize the cancellation of the order",
              kind: "signature",
              items: [
                {
                  status: "incomplete",
                  data: {
                    sign: {
                      signatureKind: "eip712",
                      domain: {
                        name: "SignedZone",
                        version: "1.0.0",
                        chainId: config.chainId,
                        verifyingContract: cancellationZone,
                      },
                      types: { OrderHashes: [{ name: "orderHashes", type: "bytes32[]" }] },
                      value: {
                        orderHashes: orderResults.map((o) => o.id),
                      },
                      primaryType: "OrderHashes",
                    },
                    post: {
                      endpoint: "/execute/cancel-signature/v1",
                      method: "POST",
                      body: {
                        orderIds: orderResults.map((o) => o.id).sort(),
                        orderKind: oracleCancellableKind,
                      },
                    },
                  },
                },
              ],
            },
          ],
        };
      }

      // Handle on-chain cancellations

      let cancelTx: TxData;

      // Set up generic filling steps
      let steps: {
        id: string;
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          tip?: string;
          data?: object;
        }[];
      }[] = [
        {
          id: "auth",
          action: "Sign in to Blur",
          description: "Some marketplaces require signing an auth message before filling",
          kind: "signature",
          items: [],
        },
        {
          id: "cancellation-signature",
          action: "Cancel order",
          description:
            "To cancel these orders you must confirm the transaction and pay the gas fee",
          kind: "transaction",
          items: [],
        },
      ];

      const maker = fromBuffer(orderResult.maker);
      switch (orderResult.kind) {
        case "seaport": {
          const orders = orderResults.map((dbOrder) => {
            return new Sdk.SeaportV11.Order(config.chainId, dbOrder.raw_data);
          });
          const exchange = new Sdk.SeaportV11.Exchange(config.chainId);

          cancelTx = exchange.cancelOrdersTx(maker, orders);
          break;
        }

        case "seaport-v1.4": {
          const orders = orderResults.map((dbOrder) => {
            return new Sdk.SeaportV14.Order(config.chainId, dbOrder.raw_data);
          });
          const exchange = new Sdk.SeaportV14.Exchange(config.chainId);

          cancelTx = exchange.cancelOrdersTx(maker, orders);
          break;
        }

        case "seaport-v1.5": {
          const orders = orderResults.map((dbOrder) => {
            return new Sdk.SeaportV15.Order(config.chainId, dbOrder.raw_data);
          });
          const exchange = new Sdk.SeaportV15.Exchange(config.chainId);

          cancelTx = exchange.cancelOrdersTx(maker, orders);
          break;
        }

        case "alienswap": {
          const orders = orderResults.map((dbOrder) => {
            return new Sdk.Alienswap.Order(config.chainId, dbOrder.raw_data);
          });
          const exchange = new Sdk.Alienswap.Exchange(config.chainId);

          cancelTx = exchange.cancelOrdersTx(maker, orders);
          break;
        }

        case "looks-rare-v2": {
          const order = new Sdk.LooksRareV2.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.LooksRareV2.Exchange(config.chainId);

          cancelTx = exchange.cancelOrderTx(maker, order);

          break;
        }

        case "zeroex-v4-erc721":
        case "zeroex-v4-erc1155": {
          const order = new Sdk.ZeroExV4.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);

          cancelTx = exchange.cancelOrderTx(maker, order);
          break;
        }

        case "universe": {
          const order = new Sdk.Universe.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Universe.Exchange(config.chainId);
          cancelTx = await exchange.cancelOrderTx(order.params);

          break;
        }

        case "rarible": {
          const order = new Sdk.Rarible.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Rarible.Exchange(config.chainId);
          cancelTx = await exchange.cancelOrderTx(order.params);

          break;
        }

        case "flow": {
          const order = new Sdk.Flow.Order(config.chainId, orderResult.raw_data);
          const exchange = new Sdk.Flow.Exchange(config.chainId);
          const nonce = order.nonce;
          cancelTx = exchange.cancelMultipleOrdersTx(order.signer, [nonce]);

          break;
        }

        case "blur": {
          if (orderResult.raw_data.createdAt) {
            // Handle Blur authentication
            const blurAuthId = b.getAuthId(maker);
            const blurAuth = await b.getAuth(blurAuthId);
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

              return { steps };
            } else {
              steps[0].items.push({
                status: "complete",
              });

              cancelTx = await axios
                .post(`${config.orderFetcherBaseUrl}/api/blur-cancel-listings`, {
                  maker,
                  contract: orderResult.raw_data.collection,
                  tokenId: orderResult.raw_data.tokenId,
                  authToken: blurAuth.accessToken,
                })
                .then((response) => response.data);
            }
          } else {
            const order = new Sdk.Blur.Order(config.chainId, orderResult.raw_data);
            const exchange = new Sdk.Blur.Exchange(config.chainId);
            cancelTx = exchange.cancelOrderTx(order.params.trader, order);
          }

          break;
        }

        // TODO: Add support for X2Y2

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      steps[1].items.push({
        status: "incomplete",
        data: {
          ...cancelTx,
          ...gasSettings,
        },
      });

      if (!steps[0].items.length || steps[0].items[0].status === "complete") {
        steps = steps.slice(1);
      }

      return {
        steps,
      };
    } catch (error) {
      logger.error(`get-execute-cancel-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
