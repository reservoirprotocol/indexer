/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { inject } from "@/api/index";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, regex, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { ensureSellTxSucceeds } from "@/utils/simulation";

const version = "v1";

export const postSimulateTopBidV1Options: RouteOptions = {
  description: "Simulate the top bid of any token",
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
    const payload = request.payload as any;

    const invalidateOrder = async (orderId: string) => {
      logger.error(`post-simulate-top-bid-${version}-handler`, `StaleOrder: ${orderId}`);

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

      const [contract, tokenId] = token.split(":");

      // Fetch the token's owner
      const ownerResult = await redb.oneOrNone(
        `
          SELECT
            nft_balances.owner
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
        throw Boom.internal("Could not simulate order");
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
        // Internal errors are tricky for bids since some marketplaces disallow filling
        // bids with stolen/marked tokens (eg. X2Y2) and so the simulation is dependent
        // on the token chosen to simulate on. Multi-token bids (eg. collection-wide or
        // token-list bids) could potentially get filled with other tokens. So here the
        // best thing to do is ensure the token simulated on is not flagged.
        const isFlaggedResult = await redb.oneOrNone(
          `
            SELECT
              tokens.is_flagged
            FROM tokens
            WHERE tokens.contract = $/contract/
              AND tokens.token_id = $/tokenId/
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );
        if (isFlaggedResult.is_flagged) {
          throw Boom.badData("Cannot run simulation on flagged token");
        }

        const topBid = await redb.oneOrNone(
          `
            SELECT
              orders.id
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
              AND (orders.taker = '\\x0000000000000000000000000000000000000000' OR orders.taker IS NULL)
              AND orders.kind IN ('seaport', 'x2y2', 'zeroex-v4-erc721', 'zeroex-v4-erc1155')
            ORDER BY orders.value DESC
            LIMIT 1
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        // If the "/execute/sell" API failed most of the time it's because of
        // failing to generate the fill signature for X2Y2 orders since their
        // backend sees that particular order as unfillable (usually it's off
        // chain cancelled). In those cases, we cancel the floor ask order. A
        // similar reasoning goes for Seaport orders (partial ones which miss
        // the raw data) and Coinbase NFT orders (no signature).
        if (topBid?.id) {
          await invalidateOrder(topBid.id);
          return { message: "Top bid order is not fillable (got invalidated)" };
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
        { contract: toBuffer(contract) }
      );

      const parsedPayload = JSON.parse(response.payload);
      const pathItem = parsedPayload.path[0];

      const success = await ensureSellTxSucceeds(
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
        await invalidateOrder(pathItem.orderId);
        return { message: "Top bid order is not fillable (got invalidated)" };
      }
    } catch (error) {
      logger.error(`post-simulate-top-bid-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
