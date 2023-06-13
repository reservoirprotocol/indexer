/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import { isAfter, add, formatISO9075 } from "date-fns";
import Joi from "joi";
import _ from "lodash";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { regex } from "@/common/utils";
import { ApiKeyManager } from "@/models/api-keys";
import { Collections } from "@/models/collections";
import { Tokens } from "@/models/tokens";
import { OpenseaIndexerApi } from "@/utils/opensea-indexer-api";

import * as collectionsRefreshCache from "@/jobs/collections-refresh/collections-refresh-cache";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as openseaOrdersProcessQueue from "@/jobs/opensea-orders/process-queue";
import * as orderFixes from "@/jobs/order-fixes/fixes";
import * as blurBidsRefresh from "@/jobs/order-updates/misc/blur-bids-refresh";
import * as blurListingsRefresh from "@/jobs/order-updates/misc/blur-listings-refresh";

const version = "v1";

export const postCollectionsRefreshV1Options: RouteOptions = {
  description: "Refresh Collection",
  tags: ["api", "x-deprecated"],
  plugins: {
    "hapi-swagger": {
      deprecated: true,
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
      metadataOnly: Joi.boolean()
        .default(false)
        .description("If true, will only refresh the collection metadata."),
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

      const currentUtcTime = new Date().toISOString();

      if (payload.metadataOnly) {
        // Refresh the collection metadata
        const tokenId = await Tokens.getSingleToken(payload.collection);

        await collectionUpdatesMetadata.addToQueue(
          collection.contract,
          tokenId,
          collection.community,
          0,
          true,
          "post-refresh-collection-v1"
        );

        if (collection.slug) {
          // Refresh opensea collection offers
          await openseaOrdersProcessQueue.addToQueue([
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

        // Refresh Blur bids
        await blurBidsRefresh.addToQueue(collection.id, true);
        await blurListingsRefresh.addToQueue(collection.id, true);

        // Refresh listings
        await OpenseaIndexerApi.fastContractSync(collection.contract);
      } else {
        const isLargeCollection = collection.tokenCount > 30000;

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

        await collectionUpdatesMetadata.addToQueue(
          collection.contract,
          tokenId,
          collection.community,
          0,
          payload.overrideCoolDown,
          "post-refresh-collection-v1"
        );

        if (collection.slug) {
          // Refresh opensea collection offers
          await openseaOrdersProcessQueue.addToQueue([
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

        // Refresh the contract floor sell and top bid
        await collectionsRefreshCache.addToQueue(collection.id);

        // Revalidate the contract orders
        await orderFixes.addToQueue([{ by: "contract", data: { contract: collection.contract } }]);

        // Refresh Blur bids
        if (collection.id.match(regex.address)) {
          await blurBidsRefresh.addToQueue(collection.id, true);
        }

        // Refresh listings
        await OpenseaIndexerApi.fastContractSync(collection.contract);

        // Do these refresh operation only for small collections
        if (!isLargeCollection) {
          const method = metadataIndexFetch.getIndexingMethod(collection.community);
          let metadataIndexInfo: metadataIndexFetch.MetadataIndexInfo = {
            kind: "full-collection",
            data: {
              method,
              collection: collection.id,
            },
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
            };
          }

          // Refresh the collection tokens metadata
          await metadataIndexFetch.addToQueue([metadataIndexInfo], true);
        }
      }

      logger.info(
        `post-collections-refresh-${version}-handler`,
        `Refresh collection=${payload.collection} at ${currentUtcTime}`
      );

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-collections-refresh-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
