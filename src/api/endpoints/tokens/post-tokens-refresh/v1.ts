/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import { isAfter, add, formatISO9075 } from "date-fns";
import _ from "lodash";
import Joi from "joi";

import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as orderFixes from "@/jobs/order-fixes/queue";
import * as resyncAttributeCache from "@/jobs/update-attribute/resync-attribute-cache";
import * as tokenRefreshCacheQueue from "@/jobs/token-updates/token-refresh-cache";
import { Collections } from "@/models/collections";
import { Tokens } from "@/models/tokens";
import { OpenseaIndexerApi } from "@/utils/opensea-indexer-api";

const version = "v1";

export const postTokensRefreshV1Options: RouteOptions = {
  description: "Refresh a token's orders and metadata",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    payload: Joi.object({
      token: Joi.string()
        .lowercase()
        .pattern(/^0x[a-fA-F0-9]{40}:[0-9]+$/)
        .description(
          "Refresh the given token. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:123`"
        )
        .required(),
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
    const payload = request.payload as any;
    const refreshCoolDownMin = 60; // How many minutes between each refresh

    try {
      const [contract, tokenId] = payload.token.split(":");

      const token = await Tokens.getByContractAndTokenId(contract, tokenId, true);

      // If no token found
      if (_.isNull(token)) {
        throw Boom.badRequest(`Token ${payload.token} not found`);
      }

      // Check when the last sync was performed
      const nextAvailableSync = add(new Date(token.lastMetadataSync), {
        minutes: refreshCoolDownMin,
      });
      if (!_.isNull(token.lastMetadataSync) && isAfter(nextAvailableSync, Date.now())) {
        throw Boom.tooEarly(`Next available sync ${formatISO9075(nextAvailableSync)} UTC`);
      }

      // Update the last sync date
      const currentUtcTime = new Date().toISOString();
      await Tokens.update(contract, tokenId, { lastMetadataSync: currentUtcTime });

      if (config.metadataIndexingMethod === "opensea") {
        // Refresh orders from OpenSea
        await OpenseaIndexerApi.fastTokenSync(payload.token);
      }

      // Refresh meta data
      const collection = await Collections.getByContractAndTokenId(contract, tokenId);

      if (collection) {
        await metadataIndexFetch.addToQueue(
          [
            {
              kind: "single-token",
              data: {
                method: config.metadataIndexingMethod,
                contract,
                tokenId,
                collection: collection.id,
              },
            },
          ],
          true
        );
      }

      // Revalidate the token orders
      await orderFixes.addToQueue([{ by: "token", data: { token: payload.token } }]);

      // Revalidate the token attribute cache
      await resyncAttributeCache.addToQueue(contract, tokenId, 0);

      // Refresh the token floor sell and top bid
      await tokenRefreshCacheQueue.addToQueue(contract, tokenId);

      logger.info(
        `post-tokens-refresh-${version}-handler`,
        `Refresh token=${payload.token} at ${currentUtcTime}`
      );

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-tokens-refresh-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
