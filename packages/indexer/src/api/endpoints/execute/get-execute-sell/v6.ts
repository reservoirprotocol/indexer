/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import { FillBidsResult } from "@reservoir0x/sdk/dist/router/v6/types";
import { TxData } from "@reservoir0x/sdk/dist/utils";
import axios from "axios";
import _ from "lodash";
import Joi from "joi";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, formatPrice, fromBuffer, now, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { ApiKeyManager } from "@/models/api-keys";
import { Sources } from "@/models/sources";
import { generateBidDetailsV6 } from "@/orderbook/orders";
import { fillErrorCallback, getExecuteError } from "@/orderbook/orders/errors";
import * as commonHelpers from "@/orderbook/orders/common/helpers";
import * as b from "@/utils/auth/blur";
import { getCurrency } from "@/utils/currencies";
import { ExecutionsBuffer } from "@/utils/executions";

const version = "v6";

export const getExecuteSellV6Options: RouteOptions = {
  description: "Sell tokens (accept bids)",
  tags: ["api", "x-deprecated"],
  timeout: {
    server: 40 * 1000,
  },
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  validate: {
    payload: Joi.object({
      orderId: Joi.string().lowercase(),
      rawOrder: Joi.object({
        kind: Joi.string()
          .lowercase()
          .valid(
            "opensea",
            "looks-rare",
            "zeroex-v4",
            "seaport",
            "seaport-v1.4",
            "seaport-v1.5",
            "x2y2"
          )
          .required(),
        data: Joi.object().required(),
      }),
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .required()
        .description(
          "Filter to a particular token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        ),
      taker: Joi.string()
        .lowercase()
        .pattern(regex.address)
        .required()
        .description(
          "Address of wallet filling the order. Example: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00`"
        ),
      quantity: Joi.number()
        .integer()
        .positive()
        .description(
          "Quantity of tokens user is selling. Only compatible when selling a single ERC1155 token. Example: `5`"
        ),
      source: Joi.string()
        .lowercase()
        .pattern(regex.domain)
        .description("Filling source used for attribution. Example: `reservoir.market`"),
      feesOnTop: Joi.array()
        .items(Joi.string().pattern(regex.fee))
        .description(
          "List of fees (formatted as `feeRecipient:feeAmount`) to be taken when filling.\nThe currency used for any fees on top matches the accepted bid's currency.\nExample: `0xF296178d553C8Ec21A2fBD2c5dDa8CA9ac905A00:1000000000000000`"
        ),
      onlyPath: Joi.boolean()
        .default(false)
        .description("If true, only the path will be returned."),
      normalizeRoyalties: Joi.boolean().default(false),
      allowInactiveOrderIds: Joi.boolean()
        .default(false)
        .description(
          "If true, do not filter out inactive orders (only relevant for order id filtering)."
        ),
      excludeEOA: Joi.boolean()
        .default(false)
        .description(
          "Exclude orders that can only be filled by EOAs, to support filling with smart contracts."
        ),
      maxFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
      maxPriorityFeePerGas: Joi.string()
        .pattern(regex.number)
        .description("Optional. Set custom gas price."),
      x2y2ApiKey: Joi.string().description("Override the X2Y2 API key used for filling."),
    }).oxor("orderId", "rawOrder"),
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
                data: Joi.object(),
              })
            )
            .required(),
        })
      ),
      errors: Joi.array().items(
        Joi.object({
          message: Joi.string(),
          orderId: Joi.number(),
        })
      ),
      path: Joi.array().items(
        Joi.object({
          orderId: Joi.string(),
          contract: Joi.string().lowercase().pattern(regex.address),
          tokenId: Joi.string().lowercase().pattern(regex.number),
          quantity: Joi.number().unsafe(),
          source: Joi.string().allow("", null),
          currency: Joi.string().lowercase().pattern(regex.address),
          quote: Joi.number().unsafe(),
          rawQuote: Joi.string().pattern(regex.number),
        })
      ),
    }).label(`getExecuteSell${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`get-execute-sell-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    let path: any[] = [];
    try {
      let orderResult: any;

      const [contract, tokenId] = payload.token.split(":");

      const tokenResult = await idb.oneOrNone(
        `
          SELECT
            tokens.is_flagged,
            coalesce(extract('epoch' from tokens.last_flag_update), 0) AS last_flag_update
          FROM tokens
          WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );
      if (!tokenResult) {
        throw Boom.badData("Unknown token");
      }

      // Scenario 3: pass raw orders that don't yet exist
      if (payload.rawOrder) {
        // Hack: As the raw order is processed, set it to the `orderId`
        // field so that it will get handled by the next pipeline step
        // of this same API rather than doing anything custom for it.
        payload.orderId = [];

        const response = await inject({
          method: "POST",
          url: `/order/v2`,
          headers: {
            "Content-Type": "application/json",
          },
          payload: { order: payload.rawOrder },
        }).then((response) => JSON.parse(response.payload));
        if (response.orderId) {
          payload.orderId = response.orderId;
        } else {
          throw Boom.badData("Raw order failed to get processed");
        }
      }

      // Scenario 2: explicitly pass an order id to fill
      if (payload.orderId) {
        orderResult = await idb
          .manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                contracts.kind AS token_kind,
                orders.value,
                orders.price,
                orders.raw_data,
                orders.source_id_int,
                orders.currency,
                orders.missing_royalties,
                orders.maker,
                orders.token_set_id,
                orders.fee_bps
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE orders.id = $/id/
                AND token_sets_tokens.contract = $/contract/
                AND token_sets_tokens.token_id = $/tokenId/
                AND orders.side = 'buy'
                AND orders.quantity_remaining >= $/quantity/
                AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                ${
                  payload.allowInactiveOrderIds
                    ? ""
                    : " AND orders.fillability_status = 'fillable' AND orders.approval_status = 'approved'"
                }
            `,
            {
              id: payload.orderId,
              contract: toBuffer(contract),
              tokenId,
              quantity: payload.quantity ?? 1,
            }
          )
          // Ideally we just have a `LIMIT 1` on the above query, however for some reason
          // adding that results in extremely low performance:
          // https://stackoverflow.com/questions/21385555/postgresql-query-very-slow-with-limit-1
          .then((result) => result[0]);
      } else {
        // Scenario 3: fetch the best offer on specified current token
        orderResult = await idb
          .manyOrNone(
            `
              SELECT
                orders.id,
                orders.kind,
                contracts.kind AS token_kind,
                orders.value,
                orders.price,
                orders.raw_data,
                orders.source_id_int,
                orders.currency,
                orders.missing_royalties,
                orders.maker,
                orders.token_set_id,
                orders.fee_bps
              FROM orders
              JOIN contracts
                ON orders.contract = contracts.address
              JOIN token_sets_tokens
                ON orders.token_set_id = token_sets_tokens.token_set_id
              WHERE token_sets_tokens.contract = $/contract/
                AND token_sets_tokens.token_id = $/tokenId/
                AND orders.side = 'buy'
                AND orders.fillability_status = 'fillable'
                AND orders.approval_status = 'approved'
                AND orders.quantity_remaining >= $/quantity/
                AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
                ${payload.normalizeRoyalties ? " AND orders.normalized_value IS NOT NULL" : ""}
                ${payload.excludeEOA ? " AND orders.kind != 'blur'" : ""}
              ORDER BY orders.value DESC
            `,
            {
              contract: toBuffer(contract),
              tokenId,
              quantity: payload.quantity ?? 1,
            }
          )
          // Ideally we just have a `LIMIT 1` on the above query, however for some reason
          // adding that results in extremely low performance:
          // https://stackoverflow.com/questions/21385555/postgresql-query-very-slow-with-limit-1
          .then((result) => result[0]);
      }

      if (payload.quantity) {
        if (orderResult.token_kind !== "erc1155") {
          throw Boom.badRequest("Only ERC1155 orders support a quantity");
        }
      }

      if (!orderResult) {
        throw Boom.badRequest("No available orders");
      }

      const sources = await Sources.getInstance();

      // Save the fill source if it doesn't exist yet
      if (payload.source) {
        await sources.getOrInsert(payload.source);
      }

      const sourceId = orderResult.source_id_int;
      const source = sourceId ? sources.get(sourceId)?.domain ?? null : null;

      // Handle fees on top
      const feesOnTop: Sdk.RouterV6.Types.Fee[] = [];
      for (const fee of payload.feesOnTop ?? []) {
        const [recipient, amount] = fee.split(":");
        feesOnTop.push({ recipient, amount });
      }

      const fees: Sdk.RouterV6.Types.Fee[] = payload.normalizeRoyalties
        ? orderResult.missing_royalties ?? []
        : [];
      if (feesOnTop.length) {
        fees.push(...feesOnTop);
      }
      const totalFee = fees.map(({ amount }) => bn(amount)).reduce((a, b) => a.add(b), bn(0));

      const totalPrice = bn(orderResult.value)
        .sub(totalFee)
        .mul(payload.quantity ?? 1);
      path = [
        {
          orderId: orderResult.id,
          contract,
          tokenId,
          quantity: payload.quantity ?? 1,
          source,
          currency: fromBuffer(orderResult.currency),
          quote: formatPrice(
            totalPrice,
            (await getCurrency(fromBuffer(orderResult.currency))).decimals
          ),
          rawQuote: totalPrice.toString(),
        },
      ];

      // Partial Seaport orders require knowing the owner
      let owner: string | undefined;
      if (["seaport-v1.4-partial", "seaport-v1.5-partial"].includes(orderResult.kind)) {
        const ownerResult = await idb.oneOrNone(
          `
            SELECT
              nft_balances.owner
            FROM nft_balances
            WHERE nft_balances.contract = $/contract/
              AND nft_balances.token_id = $/tokenId/
              AND nft_balances.amount >= $/quantity/
            LIMIT 1
          `,
          {
            contract: toBuffer(contract),
            tokenId,
            quantity: payload.quantity ?? 1,
          }
        );
        if (ownerResult) {
          owner = fromBuffer(ownerResult.owner);
        }
      }

      const bidDetails = await generateBidDetailsV6(
        {
          id: orderResult.id,
          kind: orderResult.kind,
          unitPrice: orderResult.price,
          rawData: orderResult.raw_data,
          source: source || undefined,
          fees,
          builtInFeeBps: orderResult.fee_bps,
          isProtected:
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (orderResult.raw_data as any).zone ===
            Sdk.SeaportBase.Addresses.OpenSeaProtectedOffersZone[config.chainId],
        },
        {
          kind: orderResult.token_kind,
          contract,
          tokenId,
          amount: payload.quantity,
          owner,
        },
        {
          taker: payload.taker,
        }
      );

      if (
        ["seaport-v1.4", "seaport-v1.5", "seaport-v1.4-partial", "seaport-v1.5-partial"].includes(
          bidDetails!.kind
        )
      ) {
        if (tokenResult.is_flagged) {
          throw Boom.badData("Token is flagged");
        }
      }

      if (payload.onlyPath) {
        // Skip generating any transactions if only the path was requested
        return { path };
      }

      // Set up generic filling steps
      let steps: {
        id: string;
        action: string;
        description: string;
        kind: string;
        items: {
          status: string;
          data?: any;
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
          id: "nft-approval",
          action: "Approve NFT contract",
          description:
            "Each NFT collection you want to trade requires a one-time approval transaction",
          kind: "transaction",
          items: [],
        },
        {
          id: "sale",
          action: "Accept offer",
          description: "To sell this item you must confirm the transaction and pay the gas fee",
          kind: "transaction",
          items: [],
        },
      ];

      // Custom gas settings
      const maxFeePerGas = payload.maxFeePerGas
        ? bn(payload.maxFeePerGas).toHexString()
        : undefined;
      const maxPriorityFeePerGas = payload.maxPriorityFeePerGas
        ? bn(payload.maxPriorityFeePerGas).toHexString()
        : undefined;

      // Handle Blur authentication
      let blurAuth: b.Auth | undefined;
      if (path.some((p) => p.source === "blur.io")) {
        const missingApprovals: TxData[] = [];

        const contracts = _.uniqBy(path, (p) => p.contract).map((p) => p.contract);
        for (const contract of contracts) {
          const operator = Sdk.BlurV2.Addresses.Delegate[config.chainId];
          const isApproved = await commonHelpers.getNftApproval(contract, payload.taker, operator);
          if (!isApproved) {
            missingApprovals.push({
              maxFeePerGas,
              maxPriorityFeePerGas,
              ...new Sdk.Common.Helpers.Erc721(baseProvider, contract).approveTransaction(
                payload.taker,
                operator
              ),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
          }
        }

        if (payload.blurAuth) {
          blurAuth = { accessToken: payload.blurAuth };
        } else {
          const blurAuthId = b.getAuthId(payload.taker);

          blurAuth = await b.getAuth(blurAuthId);
          if (!blurAuth) {
            const blurAuthChallengeId = b.getAuthChallengeId(payload.taker);

            let blurAuthChallenge = await b.getAuthChallenge(blurAuthChallengeId);
            if (!blurAuthChallenge) {
              blurAuthChallenge = (await axios
                .get(`${config.orderFetcherBaseUrl}/api/blur-auth-challenge?taker=${payload.taker}`)
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
              path,
            };
          }
        }

        steps[0].items.push({
          status: "complete",
        });

        if (missingApprovals.length) {
          for (const approval of missingApprovals) {
            steps[1].items.push({
              status: "incomplete",
              data: {
                ...approval,
                maxFeePerGas,
                maxPriorityFeePerGas,
              },
            });
          }

          // Force the client to poll
          steps[2].items.push({
            status: "incomplete",
          });

          // Return an early since any next steps are dependent on the approvals
          return {
            steps,
            path,
          };
        }
      }

      if (
        orderResult?.raw_data?.zone ===
        Sdk.SeaportBase.Addresses.OpenSeaProtectedOffersZone[config.chainId]
      ) {
        // Ensure the taker owns the NFTs to get sold
        const takerIsOwner = await idb.oneOrNone(
          `
            SELECT
              1
            FROM nft_balances
            WHERE nft_balances.contract = $/contract/
              AND nft_balances.token_id = $/tokenId/
              AND nft_balances.amount >= $/quantity/
              AND nft_balances.owner = $/owner/
            LIMIT 1
          `,
          {
            contract: toBuffer(contract),
            tokenId,
            quantity: payload.quantity ?? 1,
            owner: toBuffer(payload.taker),
          }
        );
        if (!takerIsOwner) {
          throw Boom.badRequest("Taker is not the owner of the token to sell");
        }
      }

      const router = new Sdk.RouterV6.Router(config.chainId, baseProvider, {
        x2y2ApiKey: payload.x2y2ApiKey ?? config.x2y2ApiKey,
        cbApiKey: config.cbApiKey,
        orderFetcherBaseUrl: config.orderFetcherBaseUrl,
        orderFetcherMetadata: {
          apiKey: await ApiKeyManager.getApiKey(request.headers["x-api-key"]),
        },
      });

      const errors: { orderId: string; message: string }[] = [];

      let result: FillBidsResult;
      try {
        result = await router.fillBidsTx([bidDetails!], payload.taker, {
          source: payload.source,
          onError: async (kind, error, data) => {
            errors.push({
              orderId: data.orderId,
              message: error.response?.data ?? error.message,
            });
            await fillErrorCallback(kind, error, data);
          },
          blurAuth,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        throw getExecuteError(error.message, errors);
      }

      const { txs } = result;

      const txData = txs[0].txData;
      const approvals = txs[0].approvals;

      // Direct filling on OpenSea might require an approval
      if (txData.to === Sdk.SeaportV14.Addresses.Exchange[config.chainId]) {
        const conduit = new Sdk.SeaportV14.Exchange(config.chainId).deriveConduit(
          Sdk.SeaportBase.Addresses.OpenseaConduitKey[config.chainId]
        );
        const isApproved = await commonHelpers.getNftApproval(
          bidDetails.contract,
          payload.taker,
          conduit
        );

        if (!isApproved) {
          steps[1].items.push({
            status: "incomplete",
            data: {
              ...approvals[0].txData,
              maxFeePerGas: payload.maxFeePerGas
                ? bn(payload.maxFeePerGas).toHexString()
                : undefined,
              maxPriorityFeePerGas: payload.maxPriorityFeePerGas
                ? bn(payload.maxPriorityFeePerGas).toHexString()
                : undefined,
            },
          });
        }
      }

      // Rarible bids are to be filled directly (because we have no modules for them yet)
      if (bidDetails.kind === "rarible") {
        const isApproved = await commonHelpers.getNftApproval(
          bidDetails.contract,
          payload.taker,
          Sdk.Rarible.Addresses.NFTTransferProxy[config.chainId]
        );
        if (!isApproved) {
          const approveTx =
            bidDetails.contractKind === "erc721"
              ? new Sdk.Common.Helpers.Erc721(baseProvider, bidDetails.contract).approveTransaction(
                  payload.taker,
                  Sdk.Rarible.Addresses.NFTTransferProxy[config.chainId]
                )
              : new Sdk.Common.Helpers.Erc1155(
                  baseProvider,
                  bidDetails.contract
                ).approveTransaction(
                  payload.taker,
                  Sdk.Rarible.Addresses.NFTTransferProxy[config.chainId]
                );

          steps[1].items.push({
            status: "incomplete",
            data: {
              ...approveTx,
              maxFeePerGas: payload.maxFeePerGas
                ? bn(payload.maxFeePerGas).toHexString()
                : undefined,
              maxPriorityFeePerGas: payload.maxPriorityFeePerGas
                ? bn(payload.maxPriorityFeePerGas).toHexString()
                : undefined,
            },
          });
        }
      }

      steps[2].items.push({
        status: "incomplete",
        data: {
          ...txData,
          maxFeePerGas: payload.maxFeePerGas ? bn(payload.maxFeePerGas).toHexString() : undefined,
          maxPriorityFeePerGas: payload.maxPriorityFeePerGas
            ? bn(payload.maxPriorityFeePerGas).toHexString()
            : undefined,
        },
      });

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

      const executionsBuffer = new ExecutionsBuffer();
      for (const item of path) {
        const txData = txs.find((tx) => tx.orderIds.includes(item.orderId))?.txData;

        let orderId = item.orderId;
        if (txData && item.source === "blur.io") {
          // Blur bids don't have the correct order id so we have to override it
          const orders = await new Sdk.Blur.Exchange(config.chainId).getMatchedOrdersFromCalldata(
            baseProvider,
            txData!.data
          );

          const index = orders.findIndex(
            ({ sell }) =>
              sell.params.collection === item.contract && sell.params.tokenId === item.tokenId
          );
          if (index !== -1) {
            orderId = orders[index].buy.hash();
          }
        }

        executionsBuffer.addFromRequest(request, {
          side: "sell",
          action: "fill",
          user: payload.taker,
          orderId,
          quantity: item.quantity,
          ...txData,
        });
      }
      await executionsBuffer.flush();

      return {
        steps,
        errors,
        path,
      };
    } catch (error) {
      if (!(error instanceof Boom.Boom)) {
        logger.error(
          `get-execute-sell-${version}-handler`,
          `Handler failure: ${error} (path = ${JSON.stringify(path)}, request = ${JSON.stringify(
            payload
          )}, trace=${(error as any).stack})`
        );
      }
      throw error;
    }
  },
};
