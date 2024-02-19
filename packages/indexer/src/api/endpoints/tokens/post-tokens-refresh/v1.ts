import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import { isAfter, add, formatISO9075 } from "date-fns";
import _ from "lodash";
import Joi from "joi";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { regex } from "@/common/utils";
import { config } from "@/config/index";
import { tokenRefreshCacheJob } from "@/jobs/token-updates/token-refresh-cache-job";
import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";
import { ApiKeyManager } from "@/models/api-keys";
import { Collections } from "@/models/collections";
import { PendingFlagStatusSyncTokens } from "@/models/pending-flag-status-sync-tokens";
import { Tokens } from "@/models/tokens";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { orderFixesJob } from "@/jobs/order-fixes/order-fixes-job";
import { OpenseaIndexerApi } from "@/utils/opensea-indexer-api";
import { backfillTokenAsksJob } from "@/jobs/elasticsearch/asks/backfill-token-asks-job";

const version = "v1";

export const postTokensRefreshV1Options: RouteOptions = {
  description: "Refresh Token",
  notes:
    "Token metadata is never automatically refreshed, but may be manually refreshed with this API.\n\nCaution: This API should be used in moderation, like only when missing data is discovered. Calling it in bulk or programmatically will result in your API key getting rate limited.",
  tags: ["api", "Tokens"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    payload: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(regex.token)
        .description(
          "Refresh the given token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        )
        .required(),
      liquidityOnly: Joi.boolean()
        .default(false)
        .description("If true, only liquidity data will be refreshed."),
      overrideCoolDown: Joi.boolean()
        .default(false)
        .description(
          "If true, will force a refresh regardless of cool down. Requires an authorized api key to be passed."
        ),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postTokensRefresh${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(`post-tokens-refresh-${version}-handler`, `Wrong response schema: ${error}`);
      throw error;
    },
  },
  handler: async (request: Request) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = request.payload as any;

    // How many minutes to enforce between each refresh
    const refreshCoolDownMin = 60;
    let overrideCoolDown = false;

    try {
      const [contract, tokenId] = payload.token.split(":");

      // Error if no token was found
      const token = await Tokens.getByContractAndTokenId(contract, tokenId, true);
      if (_.isNull(token)) {
        throw Boom.badRequest(`Token ${payload.token} not found`);
      }

      // Liquidity checks (cheap)

      const lockKey = `post-tokens-refresh-${version}-liquidity-lock:${payload.token}`;
      if (!(await redis.get(lockKey))) {
        // Revalidate the token orders
        await orderFixesJob.addToQueue([{ by: "token", data: { token: payload.token } }]);

        // Refresh the token floor sell and top bid
        await tokenRefreshCacheJob.addToQueue({ contract, tokenId, checkTopBid: true });

        // Refresh the token asks
        await backfillTokenAsksJob.addToQueue(contract, tokenId, false);

        // Lock for 10 seconds
        await redis.set(lockKey, "locked", "EX", 10);
      }

      if (payload.liquidityOnly) {
        return { message: "Request accepted" };
      }

      // Non-liquidity checks (not cheap)

      if (payload.overrideCoolDown) {
        const apiKey = await ApiKeyManager.getApiKey(request.headers["x-api-key"]);
        if (_.isNull(apiKey)) {
          throw Boom.unauthorized("Invalid API key");
        }

        if (!apiKey.permissions?.override_collection_refresh_cool_down) {
          throw Boom.unauthorized("Not allowed");
        }

        overrideCoolDown = true;
      }

      if (!overrideCoolDown) {
        // Check when the last sync was performed
        const nextAvailableSync = add(new Date(token.lastMetadataSync), {
          minutes: refreshCoolDownMin,
        });

        if (!_.isNull(token.lastMetadataSync) && isAfter(nextAvailableSync, Date.now())) {
          throw Boom.tooEarly(`Next available sync ${formatISO9075(nextAvailableSync)} UTC`);
        }
      }

      // Update the last sync date
      const currentUtcTime = new Date().toISOString();
      await Tokens.update(contract, tokenId, { lastMetadataSync: currentUtcTime });

      // Refresh orders from OpenSea
      if (_.indexOf([1, 5, 10, 56, 137, 42161], config.chainId) !== -1) {
        await OpenseaIndexerApi.fastTokenSync(payload.token);
      }

      // Refresh metadata
      const collection = await Collections.getByContractAndTokenId(contract, tokenId);

      if (!collection) {
        logger.warn(
          `post-tokens-refresh-${version}-handler`,
          `Collection does not exist. contract=${contract}, tokenId=${tokenId}`
        );
      }

      await metadataIndexFetchJob.addToQueue(
        [
          {
            kind: "single-token",
            data: {
              method: metadataIndexFetchJob.getIndexingMethod(collection),
              contract,
              tokenId,
              collection: collection?.id || contract,
            },
            context: "post-tokens-refresh-v1",
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

      // Revalidate the token attribute cache
      await resyncAttributeCacheJob.addToQueue({ contract, tokenId }, 0, overrideCoolDown);

      logger.info(
        `post-tokens-refresh-${version}-handler`,
        `Refresh token=${payload.token} at ${currentUtcTime} overrideCoolDown=${overrideCoolDown}`
      );

      return { message: "Request accepted" };
    } catch (error) {
      logger.warn(`post-tokens-refresh-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
