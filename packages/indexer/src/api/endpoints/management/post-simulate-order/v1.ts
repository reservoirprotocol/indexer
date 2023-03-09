import { CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";
import Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { inject } from "@/api/index";
import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { genericTaker, ensureBuyTxSucceeds, ensureSellTxSucceeds } from "@/utils/simulation";

const version = "v1";

export const postSimulateOrderV1Options: RouteOptions = {
  description: "Simulate any given order",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    payload: Joi.object({
      id: Joi.string().lowercase().required(),
      skipRevalidation: Joi.boolean().default(false),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postSimulateOrder${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-simulate-order-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    if (![1, 137].includes(config.chainId)) {
      return { message: "Simulation not supported" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    const logAndRevalidateOrder = async (
      id: string,
      status: "active" | "inactive",
      options?: {
        callTrace?: CallTrace;
        payload?: object;
        revalidate?: boolean;
      }
    ) => {
      logger.warn(
        `post-revalidate-order-${version}-handler`,
        JSON.stringify({
          error: "stale-order",
          callTrace: options?.callTrace,
          payload: options?.payload,
          orderId: id,
        })
      );

      if (!payload.skipRevalidation && options?.revalidate) {
        // Revalidate the order
        await inject({
          method: "POST",
          url: `/admin/revalidate-order`,
          headers: {
            "Content-Type": "application/json",
            "X-Admin-Api-Key": config.adminApiKey,
          },
          payload: {
            id,
            status,
          },
        });
      }
    };

    try {
      const id = payload.id;

      const orderResult = await idb.oneOrNone(
        `
          SELECT
            orders.kind,
            orders.side,
            orders.currency,
            orders.contract,
            orders.token_set_id,
            orders.fillability_status,
            orders.approval_status
          FROM orders
          WHERE orders.id = $/id/
        `,
        { id }
      );
      if (!orderResult?.side || !orderResult?.contract) {
        throw Boom.badRequest("Could not find order");
      }
      if (["nftx", "sudoswap", "universe"].includes(orderResult.kind)) {
        return { message: "Order not simulatable" };
      }
      if (getNetworkSettings().whitelistedCurrencies.has(fromBuffer(orderResult.currency))) {
        return { message: "Order not simulatable" };
      }
      if (getNetworkSettings().nonSimulatableContracts.includes(fromBuffer(orderResult.contract))) {
        return { message: "Associated contract is not simulatable" };
      }

      const contractResult = await redb.one(
        `
          SELECT
            contracts.kind
          FROM contracts
          WHERE contracts.address = $/contract/
        `,
        { contract: orderResult.contract }
      );
      if (!["erc721", "erc1155"].includes(contractResult.kind)) {
        return { message: "Non-standard contracts not supported" };
      }

      if (orderResult.side === "sell") {
        const response = await inject({
          method: "POST",
          url: `/execute/buy/v6`,
          headers: {
            "Content-Type": "application/json",
          },
          payload: {
            orderIds: [id],
            taker: genericTaker,
            skipBalanceCheck: true,
            currency: Sdk.Common.Addresses.Eth[config.chainId],
            allowInactiveOrderIds: true,
          },
        });

        if (JSON.parse(response.payload).statusCode === 500) {
          return { message: "Simulation failed" };
        }

        if (response.payload.includes("No available orders")) {
          return { message: "No orders to simulate" };
        }

        const parsedPayload = JSON.parse(response.payload);
        if (!parsedPayload?.path?.length) {
          return { message: "Nothing to simulate" };
        }

        const pathItem = parsedPayload.path[0];

        const { result: success, callTrace } = await ensureBuyTxSucceeds(
          genericTaker,
          {
            kind: contractResult.kind as "erc721" | "erc1155",
            contract: pathItem.contract as string,
            tokenId: pathItem.tokenId as string,
            amount: pathItem.quantity as string,
          },
          // Step 0 is the approval transaction
          parsedPayload.steps[1].items[0].data
        );
        if (success) {
          // active -> inactive
          const needRevalidation =
            orderResult.fillability_status !== "fillable" ||
            orderResult.approval_status !== "approved";
          await logAndRevalidateOrder(id, "active", {
            callTrace,
            payload: parsedPayload,
            revalidate: needRevalidation,
          });

          return { message: "Order is fillable" };
        } else {
          // inactive -> active
          const needRevalidation =
            orderResult.fillability_status === "fillable" &&
            orderResult.approval_status === "approved";
          await logAndRevalidateOrder(id, "inactive", {
            callTrace,
            payload: parsedPayload,
            revalidate: needRevalidation,
          });

          return { message: "Order is not fillable" };
        }
      } else {
        const tokenResult = await idb.oneOrNone(
          `
            SELECT
              nft_balances.owner,
              tokens.contract,
              tokens.token_id
            FROM tokens
            JOIN token_sets_tokens
              ON token_sets_tokens.contract = tokens.contract
              AND token_sets_tokens.token_id = tokens.token_id
            JOIN nft_balances
              ON nft_balances.contract = tokens.contract
              AND nft_balances.token_id = tokens.token_id
            WHERE token_sets_tokens.token_set_id = $/tokenSetId/
              AND (tokens.is_flagged IS NULL OR tokens.is_flagged = 0)
              AND nft_balances.amount > 0
              AND nft_balances.acquired_at < now() - interval '3 hours'
            LIMIT 1
          `,
          {
            tokenSetId: orderResult.token_set_id,
          }
        );
        if (!tokenResult) {
          throw Boom.internal("Could not simulate order");
        }

        const owner = fromBuffer(tokenResult.owner);

        const response = await inject({
          method: "POST",
          url: "/execute/sell/v6",
          headers: {
            "Content-Type": "application/json",
          },
          payload: {
            orderId: id,
            taker: owner,
            token: `${fromBuffer(tokenResult.contract)}:${tokenResult.token_id}`,
            allowInactiveOrderIds: true,
          },
        });

        if (JSON.parse(response.payload).statusCode === 500) {
          return { message: "Simulation failed" };
        }

        if (response.payload.includes("No available orders")) {
          return { message: "No orders to simulate" };
        }

        const parsedPayload = JSON.parse(response.payload);
        if (!parsedPayload?.path?.length) {
          return { message: "Nothing to simulate" };
        }

        const pathItem = parsedPayload.path[0];

        const { result: success, callTrace } = await ensureSellTxSucceeds(
          owner,
          {
            kind: contractResult.kind as "erc721" | "erc1155",
            contract: pathItem.contract as string,
            tokenId: pathItem.tokenId as string,
            amount: pathItem.quantity as string,
          },
          // Step 0 is the approval transaction
          parsedPayload.steps[1].items[0].data
        );
        if (success) {
          // active -> inactive
          const needRevalidation =
            orderResult.fillability_status !== "fillable" ||
            orderResult.approval_status !== "approved";
          await logAndRevalidateOrder(id, "active", {
            callTrace,
            payload: parsedPayload,
            revalidate: needRevalidation,
          });

          return { message: "Order is fillable" };
        } else {
          // inactive -> active
          const needRevalidation =
            orderResult.fillability_status === "fillable" &&
            orderResult.approval_status === "approved";
          await logAndRevalidateOrder(id, "inactive", {
            callTrace,
            payload: parsedPayload,
            revalidate: needRevalidation,
          });

          return { message: "Order is not fillable" };
        }
      }
    } catch (error) {
      logger.error(`post-simulate-order-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
