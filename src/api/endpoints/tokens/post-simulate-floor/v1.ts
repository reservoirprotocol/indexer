/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { inject } from "@/api/index";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { genericTaker, ensureBuyTxSucceeds } from "@/utils/simulation";

const version = "v1";

export const postSimulateFloorV1Options: RouteOptions = {
  description: "Simulate the floor ask of any token",
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
      token: Joi.string().lowercase().pattern(regex.token),
      router: Joi.string().valid("v5", "v6").default("v5"),
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
    const payload = request.payload as any;

    const invalidateOrder = async (orderId: string) => {
      logger.warn(`post-simulate-floor-${version}-handler`, `Detected unfillable order ${orderId}`);

      // Invalidate the order if the simulation failed
      await inject({
        method: "POST",
        url: `/admin/invalidate-order`,
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Api-Key": config.adminApiKey,
        },
        payload: {
          id: orderId,
        },
      });
    };

    try {
      const token = payload.token;
      const router = payload.router;

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
        },
      });

      if (JSON.parse(response.payload).statusCode === 500) {
        const floorAsk = await redb.oneOrNone(
          `
            SELECT
              tokens.floor_sell_id
            FROM tokens
            LEFT JOIN orders
              ON tokens.floor_sell_id = orders.id
            WHERE tokens.contract = $/contract/
              AND tokens.token_id = $/tokenId/
              AND orders.kind IN ('seaport', 'x2y2', 'zeroex-v4-erc721', 'zeroex-v4-erc1155')
          `,
          {
            contract: toBuffer(token.split(":")[0]),
            tokenId: token.split(":")[1],
          }
        );

        // If the "/execute/buy" API failed, most of the time it's because of
        // failing to generate the fill signature for X2Y2 orders since their
        // backend sees that particular order as unfillable (usually it's off
        // chain cancelled). In those cases, we cancel the floor ask order. A
        // similar reasoning goes for Seaport orders (partial ones which miss
        // the raw data) and Coinbase NFT orders (no signature).
        if (floorAsk?.floor_sell_id) {
          await invalidateOrder(floorAsk.floor_sell_id);
          return { message: "Floor order is not fillable (got invalidated)" };
        }
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
        { contract: toBuffer(token.split(":")[0]) }
      );

      const parsedPayload = JSON.parse(response.payload);
      const pathItem = parsedPayload.path[0];

      const success = await ensureBuyTxSucceeds(
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
        return { message: "Floor order is fillable" };
      } else {
        await invalidateOrder(pathItem.orderId);
        return { message: "Floor order is not fillable (got invalidated)" };
      }
    } catch (error) {
      logger.error(`post-simulate-floor-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
