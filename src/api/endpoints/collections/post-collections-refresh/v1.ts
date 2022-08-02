/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import { isAfter, add, formatISO9075 } from "date-fns";
import Joi from "joi";
import _ from "lodash";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import * as collectionsRefreshCache from "@/jobs/collections-refresh/collections-refresh-cache";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as orderFixes from "@/jobs/order-fixes/queue";
import { Collections } from "@/models/collections";
import { OpenseaIndexerApi } from "@/utils/opensea-indexer-api";

const version = "v1";

export const postCollectionsRefreshV1Options: RouteOptions = {
  description: "Refresh a collection's orders and metadata",
  tags: ["api", "Management"],
  plugins: {
    "hapi-swagger": {
      order: 13,
    },
  },
  validate: {
    payload: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Refresh the given collection. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        )
        .required(),
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
    let refreshCoolDownMin = 60 * 4; // How many minutes between each refresh

    try {
      const collection = await Collections.getById(payload.collection);

      // If no collection found
      if (_.isNull(collection)) {
        throw Boom.badRequest(`Collection ${payload.collection} not found`);
      }

      const isLargeCollection = collection.tokenCount > 30000;

      // For large collections allow refresh once a day
      if (isLargeCollection) {
        refreshCoolDownMin = 60 * 24;
      }

      // Check when the last sync was performed
      const nextAvailableSync = add(new Date(collection.lastMetadataSync), {
        minutes: refreshCoolDownMin,
      });

      if (!_.isNull(collection.lastMetadataSync) && isAfter(nextAvailableSync, Date.now())) {
        throw Boom.tooEarly(`Next available sync ${formatISO9075(nextAvailableSync)} UTC`);
      }

      // Update the last sync date
      const currentUtcTime = new Date().toISOString();
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
      const tokenId = _.isEmpty(collection.tokenIdRange) ? "1" : `${collection.tokenIdRange[0]}`;
      await collectionUpdatesMetadata.addToQueue(collection.contract, tokenId);

      // Refresh the contract floor sell and top bid
      await collectionsRefreshCache.addToQueue(collection.contract);

      // Revalidate the contract orders
      await orderFixes.addToQueue([{ by: "contract", data: { contract: collection.contract } }]);

      // Do these refresh operation only for small collections
      if (!isLargeCollection) {
        if (config.metadataIndexingMethod === "opensea") {
          // Refresh contract orders from OpenSea
          await OpenseaIndexerApi.fastContractSync(collection.contract);
        }

        // Refresh the collection tokens metadata
        await metadataIndexFetch.addToQueue(
          [
            {
              kind: "full-collection",
              data: {
                method: config.metadataIndexingMethod,
                collection: collection.id,
              },
            },
          ],
          true
        );
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
