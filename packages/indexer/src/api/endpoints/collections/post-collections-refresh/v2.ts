/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import { isAfter, add, formatISO9075 } from "date-fns";
import Joi from "joi";
import _ from "lodash";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { ApiKeyManager } from "@/models/api-keys";
import { Collections } from "@/models/collections";
import { Tokens } from "@/models/tokens";
import { OpenseaIndexerApi } from "@/utils/opensea-indexer-api";

import { collectionMetadataQueueJob } from "@/jobs/collection-updates/collection-metadata-queue-job";
import { collectionRefreshCacheJob } from "@/jobs/collections-refresh/collections-refresh-cache-job";
import {
  metadataIndexFetchJob,
  MetadataIndexFetchJobPayload,
} from "@/jobs/metadata-index/metadata-fetch-job";
import { orderFixesJob } from "@/jobs/order-fixes/order-fixes-job";
import { mintsRefreshJob } from "@/jobs/mints/mints-refresh-job";
import { blurBidsRefreshJob } from "@/jobs/order-updates/misc/blur-bids-refresh-job";
import { blurListingsRefreshJob } from "@/jobs/order-updates/misc/blur-listings-refresh-job";
import { openseaOrdersProcessJob } from "@/jobs/opensea-orders/opensea-orders-process-job";
import { PendingFlagStatusSyncCollectionSlugs } from "@/models/pending-flag-status-sync-collection-slugs";
import { PendingFlagStatusSyncContracts } from "@/models/pending-flag-status-sync-contracts";

const version = "v2";

export const postCollectionsRefreshV2Options: RouteOptions = {
  description: "Refresh Collection",
  notes:
    "Use this API to refresh a collection metadata. Only use this endpoint when you notice multiple tokens with incorrect metadata. Otherwise, refresh single token metadata. Collections with over 30,000 tokens require admin key override, so please contact technical support for assistance.\n\n Collection metadata is automatically updated at 23:30 UTC daily for:\n\n- Top 500 Collection by 24hr Volume\n\n- Collections Minted 1 Day Ago\n\n- Collections Minted 7 Days Ago\n\n Caution: This API should be used in moderation, like only when missing data is discovered. Calling it in bulk or programmatically will result in your API key getting rate limited.",
  tags: ["api", "Collections"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    headers: Joi.object({
      "x-api-key": Joi.string(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Refresh the given collection. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        )
        .required(),
      overrideCoolDown: Joi.boolean()
        .default(false)
        .description(
          "If true, will force a refresh regardless of cool down. Requires an authorized api key to be passed."
        ),
      refreshTokens: Joi.boolean()
        .default(true)
        .description("If true, will refresh the metadata for the tokens in the collection."),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postCollectionsRefresh${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `post-collections-refresh-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;

    // How many minutes between each refresh
    const refreshCoolDownMin = 60 * 4;

    try {
      let overrideCoolDown = false;
      let isLargeCollection = false;

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

      const collection = await Collections.getById(payload.collection);

      // If no collection found
      if (_.isNull(collection)) {
        throw Boom.badRequest(`Collection ${payload.collection} not found`);
      }

      // Refresh Blur bids and listings
      await blurBidsRefreshJob.addToQueue(collection.id, true);
      await blurListingsRefreshJob.addToQueue(collection.id, true);

      // Refresh collection mints
      await mintsRefreshJob.addToQueue({ collection: collection.id });

      const currentUtcTime = new Date().toISOString();
      if (!payload.refreshTokens) {
        // Refresh the collection metadata
        const tokenId = await Tokens.getSingleToken(payload.collection);

        await collectionMetadataQueueJob.addToQueue({
          contract: collection.contract,
          tokenId,
          community: collection.community,
          forceRefresh: true,
        });

        if (collection.slug) {
          // Refresh opensea collection offers
          await openseaOrdersProcessJob.addToQueue([
            {
              kind: "collection-offers",
              data: {
                contract: collection.contract,
                collectionId: collection.id,
                collectionSlug: collection.slug,
              },
            },
          ]);
        }

        // Refresh listings
        await OpenseaIndexerApi.fastContractSync(collection.id);
      } else {
        isLargeCollection = collection.tokenCount > 30000;

        // Disable large collections refresh
        if (isLargeCollection) {
          throw Boom.badRequest("Refreshing large collections is currently disabled");
        }

        if (!overrideCoolDown) {
          // Check when the last sync was performed
          const nextAvailableSync = add(new Date(collection.lastMetadataSync), {
            minutes: refreshCoolDownMin,
          });

          if (!_.isNull(collection.lastMetadataSync) && isAfter(nextAvailableSync, Date.now())) {
            throw Boom.tooEarly(`Next available sync ${formatISO9075(nextAvailableSync)} UTC`);
          }
        }

        // Update the last sync date
        await Collections.update(payload.collection, { lastMetadataSync: currentUtcTime });

        // Update the collection id of any missing tokens
        await edb.none(
          `
            WITH x AS (
              SELECT
                collections.contract,
                collections.token_id_range
              FROM collections
              WHERE collections.id = $/collection/
            )
            UPDATE tokens SET
              collection_id = $/collection/,
              updated_at = now()
            FROM x
            WHERE tokens.contract = x.contract
              AND tokens.token_id <@ x.token_id_range
              AND tokens.collection_id IS NULL
          `,
          { collection: payload.collection }
        );

        // Refresh the collection metadata
        const tokenId = await Tokens.getSingleToken(payload.collection);

        await collectionMetadataQueueJob.addToQueue({
          contract: collection.contract,
          tokenId,
          community: collection.community,
          forceRefresh: payload.overrideCoolDown,
        });

        if (collection.slug) {
          // Refresh opensea collection offers
          await openseaOrdersProcessJob.addToQueue([
            {
              kind: "collection-offers",
              data: {
                contract: collection.contract,
                collectionId: collection.id,
                collectionSlug: collection.slug,
              },
            },
          ]);
        }

        // Refresh listings
        await OpenseaIndexerApi.fastContractSync(collection.id);

        // Refresh the contract floor sell and top bid
        await collectionRefreshCacheJob.addToQueue({ collection: collection.id });

        // Revalidate the contract orders
        await orderFixesJob.addToQueue([
          { by: "contract", data: { contract: collection.contract } },
        ]);

        // Do these refresh operation only for small collections
        if (!isLargeCollection) {
          const method = metadataIndexFetchJob.getIndexingMethod(collection.community);
          let metadataIndexInfo: MetadataIndexFetchJobPayload = {
            kind: "full-collection",
            data: {
              method,
              collection: collection.id,
            },
            context: "post-refresh-collection-v2",
          };
          if (method === "opensea" && collection.slug) {
            metadataIndexInfo = {
              kind: "full-collection-by-slug",
              data: {
                method,
                contract: collection.contract,
                slug: collection.slug,
                collection: collection.id,
              },
              context: "post-refresh-collection-v2",
            };
          }

          // Refresh the collection tokens metadata
          await metadataIndexFetchJob.addToQueue([metadataIndexInfo], true);

          if (collection.slug) {
            await PendingFlagStatusSyncCollectionSlugs.add([
              {
                slug: collection.slug,
                contract: collection.contract,
                collectionId: collection.id,
                continuation: null,
              },
            ]);
          } else {
            await PendingFlagStatusSyncContracts.add([
              {
                contract: collection.contract,
                collectionId: collection.id,
                continuation: null,
              },
            ]);
          }
        }
      }

      logger.info(
        `post-collections-refresh-${version}-handler`,
        `Request accepted. collection=${payload.collection}, overrideCoolDown=${overrideCoolDown}, refreshTokens=${payload.refreshTokens}, isLargeCollection=${isLargeCollection}, currentUtcTime=${currentUtcTime}`
      );

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-collections-refresh-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
