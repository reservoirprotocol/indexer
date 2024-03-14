/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import _ from "lodash";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";
import { Tokens } from "@/models/tokens";
import { OpenseaIndexerApi } from "@/utils/opensea-indexer-api";
import { tokenRefreshCacheJob } from "@/jobs/token-updates/token-refresh-cache-job";
import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";
import { tokenReclacSupplyJob } from "@/jobs/token-updates/token-reclac-supply-job";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { orderFixesJob } from "@/jobs/order-fixes/order-fixes-job";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { backfillTokenAsksJob } from "@/jobs/elasticsearch/asks/backfill-token-asks-job";

export const postRefreshTokenOptions: RouteOptions = {
  description: "Refresh a token's orders and metadata",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      method: Joi.string()
        .optional()
        .valid("opensea", "simplehash", "centerdev", "soundxyz", "onchain"),
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Refresh the given token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        )
        .required(),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const [contract, tokenId] = payload.token.split(":");

      const token = await Tokens.getByContractAndTokenId(contract, tokenId, true);

      // If no token found
      if (_.isNull(token)) {
        throw Boom.badRequest(`Token ${payload.token} not found`);
      }

      // Update the last sync date
      const currentUtcTime = new Date().toISOString();
      await Tokens.update(contract, tokenId, { lastMetadataSync: currentUtcTime });

      // Refresh orders from OpenSea
      await OpenseaIndexerApi.fastTokenSync(payload.token);

      // Refresh meta data
      const collection = await Collections.getByContractAndTokenId(contract, tokenId);

      await metadataIndexFetchJob.addToQueue(
        [
          {
            kind: "single-token",
            data: {
              method: payload.method ?? metadataIndexFetchJob.getIndexingMethod(collection),
              contract,
              tokenId,
              collection: collection?.id || contract,
            },
            context: "post-refresh-token",
          },
        ],
        true
      );

      await PendingFlagStatusSyncTokens.add(
        [
          {
            contract,
            tokenId,
          },
        ],
        true
      );

      // Revalidate the token orders
      await orderFixesJob.addToQueue([{ by: "token", data: { token: payload.token } }]);

      // Revalidate the token attribute cache
      await resyncAttributeCacheJob.addToQueue({ contract, tokenId }, 0);

      // Refresh the token floor sell and top bid
      await tokenRefreshCacheJob.addToQueue({ contract, tokenId, checkTopBid: true });

      // Recalc supply
      await tokenReclacSupplyJob.addToQueue([{ contract, tokenId }], 0);

      // Refresh the token asks
      await backfillTokenAsksJob.addToQueue(contract, tokenId, false);

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-tokens-refresh-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
