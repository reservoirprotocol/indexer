/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Boom from "@hapi/boom";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import _ from "lodash";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";
import { Tokens } from "@/models/tokens";
import { OpenseaIndexerApi } from "@/utils/opensea-indexer-api";
import { fetchCollectionMetadataJob } from "@/jobs/token-updates/fetch-collection-metadata-job";
import { collectionMetadataQueueJob } from "@/jobs/collection-updates/collection-metadata-queue-job";
import { collectionRefreshCacheJob } from "@/jobs/collections-refresh/collections-refresh-cache-job";
import {
  metadataIndexFetchJob,
  MetadataIndexFetchJobPayload,
} from "@/jobs/metadata-index/metadata-fetch-job";
import { orderFixesJob } from "@/jobs/order-fixes/order-fixes-job";
import { openseaOrdersProcessJob } from "@/jobs/opensea-orders/opensea-orders-process-job";
import { PendingFlagStatusSyncCollectionSlugs } from "@/models/pending-flag-status-sync-collection-slugs";
import { PendingFlagStatusSyncContracts } from "@/models/pending-flag-status-sync-contracts";

export const postRefreshCollectionOptions: RouteOptions = {
  description: "Refresh a collection's orders and metadata",
  tags: ["api", "x-admin"],
  validate: {
    headers: Joi.object({
      "x-admin-api-key": Joi.string().required(),
    }).options({ allowUnknown: true }),
    payload: Joi.object({
      collection: Joi.string()
        .description(
          "Refresh the given collection. Example: `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63`"
        )
        .required(),
      refreshKind: Joi.string().valid("full-collection").default("full-collection"),
      cacheOnly: Joi.boolean()
        .default(false)
        .description("If true, will only refresh the collection cache."),
    }),
  },
  handler: async (request: Request) => {
    if (request.headers["x-admin-api-key"] !== config.adminApiKey) {
      throw Boom.unauthorized("Wrong or missing admin API key");
    }

    const payload = request.payload as any;

    try {
      const collection = await Collections.getById(payload.collection);

      if (_.isNull(collection)) {
        const tokenResult = await edb.oneOrNone(
          `
            SELECT
              tokens.contract,
              tokens.token_id
            FROM tokens
            WHERE tokens.collection_id = $/collection/
            LIMIT 1
          `,
          { collection: payload.collection }
        );

        if (tokenResult) {
          await fetchCollectionMetadataJob.addToQueue([
            {
              contract: fromBuffer(tokenResult.contract),
              tokenId: tokenResult.token_id,
              allowFallbackCollectionMetadata: false,
            },
          ]);

          return { message: "Request accepted" };
        }
      }

      // If no collection found
      if (_.isNull(collection)) {
        throw Boom.badRequest(`Collection ${payload.collection} not found`);
      }

      if (payload.cacheOnly) {
        // Refresh the contract floor sell and top bid
        await collectionRefreshCacheJob.addToQueue({ collection: collection.id });
      } else {
        // Update the last sync date
        const currentUtcTime = new Date().toISOString();
        await Collections.update(payload.collection, { lastMetadataSync: currentUtcTime });

        // Update the collection id of any missing tokens
        if (collection.tokenIdRange !== null) {
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
        }

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

        // Refresh the contract floor sell and top bid
        await collectionRefreshCacheJob.addToQueue({ collection: collection.id });

        // Revalidate the contract orders
        await orderFixesJob.addToQueue([
          { by: "contract", data: { contract: collection.contract } },
        ]);

        const method = metadataIndexFetchJob.getIndexingMethod(collection.community);
        const metadataIndexInfo: MetadataIndexFetchJobPayload = {
          kind: "full-collection",
          data: {
            method,
            collection: collection.id,
          },
          context: "post-refresh-collection",
        };

        if (collection.id === "0x4b15a9c28034dc83db40cd810001427d3bd7163d") {
          logger.info(
            `post-collections-refresh-handler`,
            JSON.stringify({
              message: `metadataIndexFetchJob. collection=${collection.id}`,
              payload,
            })
          );
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

        if (method === "opensea") {
          // Refresh contract orders from OpenSea
          await OpenseaIndexerApi.fastContractSync(collection.id);
        }
      }

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-collections-refresh-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
