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
import { ApiKeyManager } from "@/models/api-keys";
import { Tokens } from "@/models/tokens";

const version = "v1";

export const postCollectionsRefreshV1Options: RouteOptions = {
  description: "Refresh Collection",
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
    const refreshCoolDownMin = 60 * 4; // How many minutes between each refresh
    let overrideCoolDown = false;

    try {
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
        let tokenId;
        if (collection.tokenIdRange?.length) {
          tokenId = `${collection.tokenIdRange[0]}`;
        } else {
          tokenId = await Tokens.getSingleToken(payload.collection);
        }

        await collectionUpdatesMetadata.addToQueue(
          collection.contract,
          tokenId,
          collection.community,
          0,
          true
        );
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
        let tokenId;
        if (collection.tokenIdRange?.length) {
          tokenId = `${collection.tokenIdRange[0]}`;
        } else {
          tokenId = await Tokens.getSingleToken(payload.collection);
        }

        await collectionUpdatesMetadata.addToQueue(
          collection.contract,
          tokenId,
          collection.community,
          0,
          payload.overrideCoolDown
        );

        // Refresh the contract floor sell and top bid
        await collectionsRefreshCache.addToQueue(collection.id);

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
                  method: metadataIndexFetch.getIndexingMethod(collection.community),
                  collection: collection.id,
                },
              },
            ],
            true
          );
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
