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
import * as offchainCancel from "@/utils/offchain-cancel";

const version = "v3";

export const getExecuteCancelV3Options: RouteOptions = {
  description: "Cancel Orders",
  notes: "Cancel existing orders on any marketplace",
  tags: ["api"],
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
        "payment-processor-v2",
        "payment-processor-v2.0.1",
        "rarible",
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
                orderIds: Joi.array().items(Joi.string()),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    let steps: {
      id: string;
      action: string;
      description: string;
      kind: string;
      items: {
        status: string;
        orderIds?: string[];
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
      {
        id: "cancellation",
        action: "Submit cancellation",
        description: "To cancel these orders you must confirm the transaction and pay the gas fee",
        kind: "transaction",
        items: [],
      },
    ];

    const gasSettings = {
      maxFeePerGas: payload.maxFeePerGas ? bn(payload.maxFeePerGas).toHexString() : undefined,
      maxPriorityFeePerGas: payload.maxPriorityFeePerGas
        ? bn(payload.maxPriorityFeePerGas).toHexString()
        : undefined,
    };

    // Case 1: cancel by maker

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

        case "payment-processor": {
          const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId);
          cancelTx = exchange.revokeMasterNonceTx(payload.maker);
          break;
        }

        case "payment-processor-v2": {
          const exchange = new Sdk.PaymentProcessorV2.Exchange(config.chainId);
          cancelTx = exchange.revokeMasterNonceTx(payload.maker);
          break;
        }

        case "payment-processor-v2.0.1": {
          const exchange = new Sdk.PaymentProcessorV201.Exchange(config.chainId);
          cancelTx = exchange.revokeMasterNonceTx(payload.maker);
          break;
        }

        default: {
          throw Boom.notImplemented("Unsupported order kind");
        }
      }

      steps[2].items.push({
        status: "incomplete",
        data: {
          ...cancelTx,
          ...gasSettings,
        },
      });

      // Filter out empty steps
      steps = steps.filter((s) => s.items.length);

      return { steps };
    }

    // Case 2: cancel by token or order ids

    try {
      // Handle Blur bids as a special edge-case

      const blurBidsOrderIds =
        payload.orderIds?.filter((orderId: string) => orderId.startsWith("blur-collection-bid")) ??
        [];
      if (blurBidsOrderIds.length) {
        const maker = blurBidsOrderIds[0].split(":")[1];

        // Handle Blur authentication
        const blurAuthId = b.getAuthId(maker);
        let blurAuth = await b.getAuth(blurAuthId);
        if (!blurAuth) {
          if (payload.blurAuth) {
            blurAuth = { accessToken: payload.blurAuth };
          } else {
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
          }
        } else {
          steps[0].items.push({
            status: "complete",
          });

          const orderIds = blurBidsOrderIds.sort();
          steps[1].items.push({
            status: "incomplete",
            orderIds,
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
        }
      }

      // Fetch the orders to get cancelled
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderResults: { id: string; kind: string; maker: Buffer; raw_data: any }[] =
        payload.token
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

      // Return early in case there are no orders to cancel
      if (!orderResults.length && !steps.some((s) => s.items.length)) {
        throw Boom.badRequest("No matching order(s)");
      }

      // Group by order kind
      const ordersByKind: {
        [kind: string]: {
          onchainCancellable: (typeof orderResults)[0][];
          offchainCancellable: (typeof orderResults)[0][];
        };
      } = {};
      for (const order of orderResults) {
        if (!ordersByKind[order.kind]) {
          ordersByKind[order.kind] = {
            onchainCancellable: [],
            offchainCancellable: [],
          };
        }
        if (offchainCancel.isOrderNativeOffChainCancellable(order.raw_data)) {
          ordersByKind[order.kind].offchainCancellable.push(order);
        } else {
          ordersByKind[order.kind].onchainCancellable.push(order);
        }
      }

      for (const [kind, data] of Object.entries(ordersByKind)) {
        // Offchain cancellations
        if (data.offchainCancellable.length) {
          const orderIds = data.offchainCancellable.map((o) => o.id);
          if (kind === "payment-processor-v2") {
            steps[1].items.push({
              status: "incomplete",
              orderIds,
              data: {
                sign: await offchainCancel.paymentProcessorV2.generateOffChainCancellationSignatureData(
                  orderIds.sort()
                ),
                post: {
                  endpoint: "/execute/cancel-signature/v1",
                  method: "POST",
                  body: {
                    orderIds: orderIds.sort(),
                    orderKind: kind,
                  },
                },
              },
            });
          }
          if (kind === "payment-processor-v2.0.1") {
            steps[1].items.push({
              status: "incomplete",
              orderIds,
              data: {
                sign: await offchainCancel.paymentProcessorV2.generateOffChainCancellationSignatureData(
                  orderIds.sort()
                ),
                post: {
                  endpoint: "/execute/cancel-signature/v1",
                  method: "POST",
                  body: {
                    orderIds: orderIds.sort(),
                    orderKind: kind,
                  },
                },
              },
            });
          } else {
            steps[1].items.push({
              status: "incomplete",
              orderIds,
              data: {
                sign: offchainCancel.seaport.generateOffChainCancellationSignatureData(orderIds),
                post: {
                  endpoint: "/execute/cancel-signature/v1",
                  method: "POST",
                  body: {
                    orderIds: orderIds.sort(),
                    orderKind: kind,
                  },
                },
              },
            });
          }
        }

        // Onchain cancellations
        if (data.onchainCancellable.length) {
          const cancelTxs: {
            data: TxData;
            orderIds: string[];
          }[] = [];

          // The assumption is that the orders all have the same maker
          const maker = fromBuffer(data.onchainCancellable[0].maker);
          switch (kind) {
            case "seaport": {
              const orders = data.onchainCancellable.map((order) => {
                return new Sdk.SeaportV11.Order(config.chainId, order.raw_data);
              });
              const exchange = new Sdk.SeaportV11.Exchange(config.chainId);

              cancelTxs.push({
                data: exchange.cancelOrdersTx(maker, orders),
                orderIds: data.onchainCancellable.map((o) => o.id),
              });
              break;
            }

            case "seaport-v1.4": {
              const orders = data.onchainCancellable.map((order) => {
                return new Sdk.SeaportV14.Order(config.chainId, order.raw_data);
              });
              const exchange = new Sdk.SeaportV14.Exchange(config.chainId);

              cancelTxs.push({
                data: exchange.cancelOrdersTx(maker, orders),
                orderIds: data.onchainCancellable.map((o) => o.id),
              });
              break;
            }

            case "seaport-v1.5": {
              const orders = data.onchainCancellable.map((order) => {
                return new Sdk.SeaportV15.Order(config.chainId, order.raw_data);
              });
              const exchange = new Sdk.SeaportV15.Exchange(config.chainId);

              cancelTxs.push({
                data: exchange.cancelOrdersTx(maker, orders),
                orderIds: data.onchainCancellable.map((o) => o.id),
              });
              break;
            }

            case "alienswap": {
              const orders = data.onchainCancellable.map((order) => {
                return new Sdk.Alienswap.Order(config.chainId, order.raw_data);
              });
              const exchange = new Sdk.Alienswap.Exchange(config.chainId);

              cancelTxs.push({
                data: exchange.cancelOrdersTx(maker, orders),
                orderIds: data.onchainCancellable.map((o) => o.id),
              });
              break;
            }

            case "looks-rare-v2": {
              for (const order of data.onchainCancellable) {
                const sdkOrder = new Sdk.LooksRareV2.Order(config.chainId, order.raw_data);
                const exchange = new Sdk.LooksRareV2.Exchange(config.chainId);

                cancelTxs.push({
                  data: exchange.cancelOrderTx(maker, sdkOrder),
                  orderIds: [order.id],
                });
              }

              break;
            }

            case "zeroex-v4-erc721":
            case "zeroex-v4-erc1155": {
              for (const order of data.onchainCancellable) {
                const sdkOrder = new Sdk.ZeroExV4.Order(config.chainId, order.raw_data);
                const exchange = new Sdk.ZeroExV4.Exchange(config.chainId);

                cancelTxs.push({
                  data: exchange.cancelOrderTx(maker, sdkOrder),
                  orderIds: [order.id],
                });
              }

              break;
            }

            case "rarible": {
              for (const order of data.onchainCancellable) {
                const sdkOrder = new Sdk.Rarible.Order(config.chainId, order.raw_data);
                const exchange = new Sdk.Rarible.Exchange(config.chainId);

                cancelTxs.push({
                  data: await exchange.cancelOrderTx(sdkOrder.params),
                  orderIds: [order.id],
                });
              }

              break;
            }

            case "payment-processor": {
              for (const order of data.onchainCancellable) {
                const sdkOrder = new Sdk.PaymentProcessor.Order(config.chainId, order.raw_data);
                const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId);

                cancelTxs.push({
                  data: exchange.cancelOrderTx(maker, sdkOrder),
                  orderIds: [order.id],
                });
              }

              break;
            }

            case "payment-processor-v2": {
              for (const order of data.onchainCancellable) {
                const sdkOrder = new Sdk.PaymentProcessorV2.Order(config.chainId, order.raw_data);
                const exchange = new Sdk.PaymentProcessorV2.Exchange(config.chainId);

                cancelTxs.push({
                  data: exchange.cancelOrderTx(maker, sdkOrder),
                  orderIds: [order.id],
                });
              }

              break;
            }

            case "blur": {
              // Handle Blur authentication
              const blurAuthId = b.getAuthId(maker);
              let blurAuth = await b.getAuth(blurAuthId);
              if (!blurAuth) {
                if (payload.blurAuth) {
                  blurAuth = { accessToken: payload.blurAuth };
                } else {
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
                      Math.floor(new Date(blurAuthChallenge?.expiresOn).getTime() / 1000) -
                        now() -
                        60
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
                }
              }

              for (const order of data.onchainCancellable) {
                const blurCancelTx = await axios
                  .post(`${config.orderFetcherBaseUrl}/api/blur-cancel-listings`, {
                    maker,
                    contract: order.raw_data.collection,
                    tokenId: order.raw_data.tokenId,
                    authToken: blurAuth.accessToken,
                  })
                  .then((response) => response.data);
                if (!blurCancelTx) {
                  throw Boom.badRequest("Could not generate cancellations for all orders");
                }

                cancelTxs.push({
                  data: blurCancelTx,
                  orderIds: [order.id],
                });
              }

              break;
            }

            default: {
              throw Boom.notImplemented("Unsupported order kind");
            }
          }

          for (const { data, orderIds } of cancelTxs) {
            steps[2].items.push({
              status: "incomplete",
              orderIds,
              data: {
                ...data,
                ...gasSettings,
              },
            });
          }
        }
      }

      // Filter out empty steps
      steps = steps.filter((s) => s.items.length);

      return {
        steps,
      };
    } catch (error) {
      logger.error(`get-execute-cancel-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
