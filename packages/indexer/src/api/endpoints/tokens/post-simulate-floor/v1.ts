/* eslint-disable @typescript-eslint/no-explicit-any */

import { CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";
import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { inject } from "@/api/index";
import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { genericTaker, ensureBuyTxSucceeds } from "@/utils/simulation";

const version = "v1";

export const postSimulateFloorV1Options: RouteOptions = {
  description: "Simulate the floor ask of any token",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
    },
  },
  timeout: {
    server: 2 * 60 * 1000,
  },
  validate: {
    payload: Joi.object({
      token: Joi.string().lowercase().pattern(regex.token),
      router: Joi.string().valid("v5", "v6").default("v6"),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postSimulateFloor${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-simulate-floor-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    if (![1, 137].includes(config.chainId)) {
      return { message: "Simulation not supported" };
    }

    const payload = request.payload as any;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const invalidateOrder = async (orderId: string, callTrace?: CallTrace, payload?: any) => {
      logger.error(
        `post-simulate-floor-${version}-handler`,
        JSON.stringify({ error: "stale-order", callTrace, payload, orderId })
      );

      // Invalidate the order if the simulation failed
      await inject({
        method: "POST",
        url: `/admin/revalidate-order`,
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Api-Key": config.adminApiKey,
        },
        payload: {
          id: orderId,
          status: "inactive",
        },
      });
    };

    try {
      const token = payload.token;
      const router = payload.router;

      const [contract] = token.split(":");

      if (getNetworkSettings().nonSimulatableContracts.includes(contract)) {
        return { message: "Associated contract is not simulatable" };
      }

      const response = await inject({
        method: "POST",
        // Latest V5 router API is V4
        // Latest V6 router API is V6
        url: `/execute/buy/${router === "v5" ? "v4" : "v6"}`,
        headers: {
          "Content-Type": "application/json",
        },
        payload: {
          tokens: [token],
          taker: genericTaker,
          skipBalanceCheck: true,
          currency: Sdk.Common.Addresses.Native[config.chainId],
        },
      });

      if (JSON.parse(response.payload).statusCode === 500) {
        return { message: "Simulation failed" };
      }

      if (response.payload.includes("No available orders")) {
        return { message: "No orders to simulate" };
      }

      const contractResult = await redb.one(
        `
          SELECT
            contracts.kind
          FROM contracts
          WHERE contracts.address = $/contract/
        `,
        { contract: toBuffer(contract) }
      );
      if (!["erc721", "erc1155"].includes(contractResult.kind)) {
        return { message: "Non-standard contracts not supported" };
      }

      const parsedPayload = JSON.parse(response.payload);
      if (!parsedPayload?.path?.length) {
        return { message: "Nothing to simulate" };
      }

      const saleData = parsedPayload.steps.find((s: any) => s.id === "sale").items[0]?.data;
      if (!saleData) {
        return { message: "Nothing to simulate" };
      }

      const pathItem = parsedPayload.path[0];

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { result: success, callTrace } = await ensureBuyTxSucceeds(
        genericTaker,
        {
          kind: contractResult.kind as "erc721" | "erc1155",
          contract: pathItem.contract as string,
          tokenId: pathItem.tokenId as string,
          amount: pathItem.quantity as string,
        },
        saleData
      );
      if (success) {
        return { message: "Floor order is fillable" };
      } else {
        const orderResult = await idb.oneOrNone(
          `
            SELECT
              orders.kind,
              orders.currency
            FROM orders
            WHERE orders.id = $/id/
          `,
          { id: pathItem.orderId }
        );

        if (
          ["blur", "nftx", "sudoswap"].includes(orderResult.kind) ||
          getNetworkSettings().whitelistedCurrencies.has(fromBuffer(orderResult.currency))
        ) {
          return { message: "Order not simulatable" };
        } else {
          await invalidateOrder(pathItem.orderId, callTrace, parsedPayload);
          return { message: "Floor order is not fillable (got invalidated)" };
        }
      }
    } catch (error) {
      logger.error(`post-simulate-floor-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
