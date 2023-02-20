/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import _ from "lodash";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { fromBuffer, toBuffer } from "@/common/utils";
import { idb } from "@/common/db";
import { PendingFlagStatusSyncJobs } from "@/models/pending-flag-status-sync-jobs";
import * as flagStatusProcessQueue from "@/jobs/flag-status/process-queue";

export const postFlagAddressOptions: RouteOptions = {
  description: "Update address flag status",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      address: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}$/)
        .required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;
    const address = toBuffer(payload.address);

    try {
      const created = await idb.oneOrNone(
        "INSERT INTO flagged_addresses (address) VALUES ($/address/) ON CONFLICT DO NOTHING RETURNING 1",
        {
          address,
        }
      );

      if (created) {
        const tokens = await idb.manyOrNone(
          `
            SELECT nft_balances.contract, nft_balances.token_id, tokens.collection_id, tokens.is_flagged
            FROM nft_balances
            JOIN tokens ON nft_balances.contract = tokens.contract AND nft_balances.token_id = tokens.token_id
            WHERE owner = $/address/
            AND amount > 0`,
          {
            address,
          }
        );

        if (tokens?.length) {
          const tokensByCollection = _.groupBy(tokens, "collection_id");

          for (const collectionId in tokensByCollection) {
            const contract = fromBuffer(tokensByCollection[collectionId][0].contract);

            const pendingFlagStatusSyncJobs = new PendingFlagStatusSyncJobs();
            await pendingFlagStatusSyncJobs.add(
              [
                {
                  kind: "tokens",
                  data: {
                    collectionId,
                    contract,
                    tokens: tokensByCollection[collectionId].map(({ token_id, is_flagged }) => ({
                      tokenId: token_id,
                      tokenIsFlagged: is_flagged,
                    })),
                  },
                },
              ],
              true
            );

            await flagStatusProcessQueue.addToQueue();
          }
        }
      }

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-flag-address-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
