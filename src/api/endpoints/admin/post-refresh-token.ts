/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
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

export const postRefreshTokenOptions: RouteOptions = {
  description: "Refresh a token's orders and metadata",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
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

      if (config.metadataIndexingMethod === "opensea") {
        // Refresh orders from OpenSea
        await OpenseaIndexerApi.fastTokenSync(payload.token);
      }

      // Refresh meta data
      const collection = await Collections.getByContractAndTokenId(contract, tokenId);

      let method = metadataIndexFetch.getIndexingMethod(collection?.community || null);

      if (contract === "0x11708dc8a3ea69020f520c81250abb191b190110") {
        method = "simplehash";

        logger.info(
          `post-tokens-refresh-handler`,
          `Forced rtfkt. contract=${contract}, tokenId=${tokenId}, method=${method}`
        );
      }

      await metadataIndexFetch.addToQueue(
        [
          {
            kind: "single-token",
            data: {
              method: metadataIndexFetch.getIndexingMethod(collection?.community || null),
              contract,
              tokenId,
              collection: collection?.id || contract,
            },
          },
        ],
        true
      );

      // Revalidate the token orders
      await orderFixes.addToQueue([{ by: "token", data: { token: payload.token } }]);

      // Revalidate the token attribute cache
      await resyncAttributeCache.addToQueue(contract, tokenId, 0);

      // Refresh the token floor sell and top bid
      await tokenRefreshCacheQueue.addToQueue(contract, tokenId);

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-tokens-refresh-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
