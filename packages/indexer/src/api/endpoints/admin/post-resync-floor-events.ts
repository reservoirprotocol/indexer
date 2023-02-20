/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import pLimit from "p-limit";

import { idb, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

export const postResyncFloorEventsOptions: RouteOptions = {
  description: "Trigger fixing any floor events inconsistencies for any particular collection.",
  tags: ["api", "x-admin"],
  timeout: {
    server: 5 * 60 * 1000,
  },
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string(),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/),
    })
      .or("collection", "token")
      .oxor("collection", "token"),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const handleToken = async (contract: string, tokenId: string) => {
        const tokenCacheResult = await redb.oneOrNone(
          `
            SELECT
              tokens.floor_sell_id,
              tokens.floor_sell_value
            FROM tokens
            WHERE tokens.contract = $/contract/
              AND tokens.token_id = $/tokenId/
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        const latestEventResult = await redb.oneOrNone(
          `
            SELECT
              token_floor_sell_events.order_id,
              token_floor_sell_events.price
            FROM token_floor_sell_events
            WHERE token_floor_sell_events.contract = $/contract/
              AND token_floor_sell_events.token_id = $/tokenId/
            ORDER BY token_floor_sell_events.created_at DESC
            LIMIT 1
          `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );

        const floorMatches = tokenCacheResult.floor_sell_value == latestEventResult?.price;
        if (!floorMatches) {
          await idb.none(
            `
              WITH x AS (
                SELECT
                  orders.id,
                  orders.maker,
                  orders.price,
                  orders.source_id_int,
                  orders.valid_between,
                  orders.nonce
                FROM tokens
                LEFT JOIN orders
                  ON tokens.floor_sell_id = orders.id
                WHERE tokens.contract = $/contract/
                  AND tokens.token_id = $/tokenId/
              )
              INSERT INTO token_floor_sell_events(
                kind,
                contract,
                token_id,
                order_id,
                maker,
                price,
                source_id_int,
                valid_between,
                nonce,
                previous_price
              )
              SELECT
                'revalidation',
                $/contract/,
                $/tokenId/,
                x.id,
                x.maker,
                x.price,
                x.source_id_int,
                x.valid_between,
                x.nonce,
                $/previousPrice/
              FROM x
            `,
            {
              contract: toBuffer(contract),
              tokenId,
              previousPrice: latestEventResult?.price || null,
            }
          );
        }
      };

      if (payload.token) {
        const [contract, tokenId] = payload.token.split(":");
        await handleToken(contract, tokenId);
      } else if (payload.collection) {
        const tokens = await redb.manyOrNone(
          `
            SELECT
              tokens.contract,
              tokens.token_id
            FROM tokens
            WHERE tokens.collection_id = $/collection/
            LIMIT 10000
          `,
          { collection: payload.collection }
        );

        if (tokens) {
          const limit = pLimit(20);
          await Promise.all(
            tokens.map(({ contract, token_id }) =>
              limit(() => handleToken(fromBuffer(contract), token_id))
            )
          );
        }
      }

      return { message: "Success" };
    } catch (error) {
      logger.error("post-fix-token-cache-handler", `Handler failure: ${error}`);
      throw error;
    }
  },
};
