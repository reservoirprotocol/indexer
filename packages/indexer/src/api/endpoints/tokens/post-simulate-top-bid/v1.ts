/* eslint-disable @typescript-eslint/no-explicit-any */

import { CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";
import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { inject } from "@/api/index";
import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, now, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";
import { ensureSellTxSucceeds } from "@/utils/simulation";

const version = "v1";

export const postSimulateTopBidV1Options: RouteOptions = {
  description: "Simulate the top bid of any token",
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
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postSimulateTopBid${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-simulate-top-bid-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    if (![1, 137].includes(config.chainId)) {
      return { message: "Simulation not supported" };
    }

    const payload = request.payload as any;

    const invalidateOrder = async (orderId: string, callTrace?: CallTrace, payload?: any) => {
      logger.error(
        `post-simulate-top-bid-${version}-handler`,
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

      const [contract, tokenId] = token.split(":");

      if (getNetworkSettings().nonSimulatableContracts.includes(contract)) {
        return { message: "Associated contract is not simulatable" };
      }

      // Fetch the token's owner
      const ownerResult = await idb.oneOrNone(
        `
          SELECT
            nft_balances.owner,
            extract('epoch' from nft_balances.acquired_at) AS acquired_at
          FROM nft_balances
          WHERE nft_balances.contract = $/contract/
            AND nft_balances.token_id = $/tokenId/
            AND nft_balances.amount > 0
          LIMIT 1
        `,
        {
          contract: toBuffer(contract),
          tokenId,
        }
      );
      if (!ownerResult) {
        throw Boom.badRequest("Could not get token owner");
      }
      if (ownerResult && ownerResult.acquired_at >= now() - 3 * 3600) {
        throw Boom.badRequest("Taker acquired token too recently");
      }

      const owner = fromBuffer(ownerResult.owner);

      const response = await inject({
        method: "POST",
        url: "/execute/sell/v6",
        headers: {
          "Content-Type": "application/json",
        },
        payload: {
          token,
          taker: owner,
        },
      });

      if (JSON.parse(response.payload).statusCode === 500) {
        return { message: "Simulation failed" };
      }

      if (response.payload.includes("No available orders")) {
        return { message: "No orders to simulate" };
      }

      const contractResult = await idb.one(
        `
          SELECT
            contracts.kind
          FROM contracts
          WHERE contracts.address = $/contract/
        `,
        { contract: toBuffer(contract) }
      );

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
        return { message: "Top bid order is fillable" };
      } else {
        const orderCurrency = await idb
          .oneOrNone(
            `
              SELECT
                orders.currency
              FROM orders
              WHERE orders.id = $/id/
            `,
            { id: pathItem.orderId }
          )
          .then((r) => fromBuffer(r.currency));

        if (
          !["blur.io", "sudoswap.xyz", "nftx.io"].includes(pathItem.source) &&
          !getNetworkSettings().whitelistedCurrencies.has(orderCurrency)
        ) {
          await invalidateOrder(pathItem.orderId, callTrace, parsedPayload);
          return { message: "Top bid order is not fillable (got invalidated)" };
        } else {
          return { message: "Pool orders not supported" };
        }
      }
    } catch (error) {
      logger.error(`post-simulate-top-bid-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
